/**
 * Jira reconciliation job.
 * Runs every 15 minutes. For each active connection with jira_sync_enabled ventures,
 * fetches recently modified Jira issues and reconciles against jira_sync_mappings.
 *
 * Strategy: fetch issues updated in the last 20 minutes (overlapping window),
 * compare sync_hash, apply updates where hash differs.
 */

import { db } from '../db/index.js';
import { eq, and, inArray, gte } from 'drizzle-orm';
import {
  jiraConnections,
  jiraSyncMappings,
  jiraSyncLog,
  jiraStatusMappings,
  ventures,
  workstreams,
  milestones,
  risks,
  issues,
  users,
} from '../db/schema.js';
import { decryptToken } from './encryption.js';
import * as jiraClient from './jiraClient.js';
import {
  mapEpicToWorkstream,
  mapIssueToMilestone,
  mapIssueToRisk,
  mapIssueToIssue,
  classifyIssue,
  computeSyncHash,
} from './jiraMappers.js';

const RECONCILIATION_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const OVERLAP_WINDOW_MINUTES = 20;
const SYNC_USER_OID = 'sync-system-001';

let reconciliationTimer: ReturnType<typeof setInterval> | null = null;

// ── Helpers ────────────────────────────────────────────────────

async function getSyncUserId(): Promise<string> {
  const [syncUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.azureOid, SYNC_USER_OID))
    .limit(1);

  if (!syncUser) {
    throw new Error('Sync system user not found. Run the seed script first.');
  }
  return syncUser.id;
}

async function getCustomMappings(connectionId: string): Promise<Record<string, string>> {
  const rows = await db
    .select({ jiraStatusName: jiraStatusMappings.jiraStatusName, orbitStatus: jiraStatusMappings.orbitStatus })
    .from(jiraStatusMappings)
    .where(eq(jiraStatusMappings.connectionId, connectionId));
  return Object.fromEntries(rows.map((r) => [r.jiraStatusName, r.orbitStatus]));
}

async function writeSyncLog(opts: {
  connectionId: string;
  ventureId?: string;
  eventType: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  jiraEntityType?: string;
  jiraEntityId?: string;
  orbitEntityType?: string;
  orbitEntityId?: string;
  payload?: any;
}): Promise<void> {
  await db.insert(jiraSyncLog).values({
    connectionId: opts.connectionId,
    ventureId: opts.ventureId ?? null,
    eventType: opts.eventType,
    level: opts.level,
    message: opts.message,
    jiraEntityType: opts.jiraEntityType ?? null,
    jiraEntityId: opts.jiraEntityId ?? null,
    orbitEntityType: opts.orbitEntityType ?? null,
    orbitEntityId: opts.orbitEntityId ?? null,
    payload: opts.payload ?? null,
  });
}

// ── Per-connection reconciliation ──────────────────────────────

/**
 * Reconciles a single active Jira connection.
 * Exported for use by the manual per-venture re-sync trigger.
 */
export async function reconcileConnection(connectionId: string, ventureId?: string): Promise<void> {
  const [conn] = await db
    .select()
    .from(jiraConnections)
    .where(and(eq(jiraConnections.id, connectionId), eq(jiraConnections.status, 'connected')))
    .limit(1);

  if (!conn) {
    console.warn(`[reconciliation] Connection ${connectionId} not found or not in 'connected' status. Skipping.`);
    return;
  }

  // Fix #3: Guard against running concurrently with an active import.
  // If the import lock is held the data is in a transitional (partially deleted)
  // state — reconciliation at this point would write duplicate or conflicting rows.
  if (conn.importLock) {
    console.warn(`[reconciliation] Connection ${connectionId} has importLock=true — import is in progress. Skipping reconciliation cycle.`);
    return;
  }

  let apiToken: string;
  try {
    apiToken = decryptToken(conn.apiTokenEncrypted);
  } catch (err) {
    await writeSyncLog({
      connectionId,
      eventType: 'reconciliation',
      level: 'error',
      message: `Cannot decrypt API token: ${(err as Error).message}`,
    });
    return;
  }

  // ── Auth ping (FR-006) ──────────────────────────────────────
  const authCheck = await jiraClient.testConnection(conn.instanceUrl, conn.accountEmail, apiToken);
  if (!authCheck.success) {
    await db
      .update(jiraConnections)
      .set({ status: 'error', lastError: `Auth failed: ${authCheck.error}`, updatedAt: new Date() })
      .where(eq(jiraConnections.id, connectionId));

    await writeSyncLog({
      connectionId,
      eventType: 'reconciliation',
      level: 'error',
      message: `Authentication failed during reconciliation: ${authCheck.error}. Sync halted.`,
    });
    return;
  }

  await db
    .update(jiraConnections)
    .set({ lastValidatedAt: new Date(), updatedAt: new Date() })
    .where(eq(jiraConnections.id, connectionId));

  const syncUserId = await getSyncUserId();
  const customMappings = await getCustomMappings(connectionId);

  // Get ventures for this connection (sync enabled)
  const ventureFilter: any[] = [
    eq(ventures.jiraConnectionId, connectionId),
    eq(ventures.jiraSyncEnabled, true),
  ];
  if (ventureId) {
    ventureFilter.push(eq(ventures.id, ventureId));
  }

  const activeVentures = await db
    .select({
      id: ventures.id,
      jiraProjectKey: ventures.jiraProjectKey,
      targetEndDate: ventures.targetEndDate,
    })
    .from(ventures)
    .where(and(...ventureFilter));

  const windowStart = new Date(Date.now() - OVERLAP_WINDOW_MINUTES * 60 * 1000);
  const windowJql = windowStart.toISOString().slice(0, 19).replace('T', ' ');

  for (const venture of activeVentures) {
    if (!venture.jiraProjectKey) continue;

    try {
      // Fix #10: Wrap project key in double-quotes so JQL handles keys with spaces/special chars
      // Fix #11: Paginate to fetch ALL recently updated issues, not just the first 100
      const jqlBase = `project="${venture.jiraProjectKey}" AND updated >= "${windowJql}" ORDER BY updated ASC`;
      const base = conn.instanceUrl.replace(/\/$/, '');
      const authHeader = 'Basic ' + Buffer.from(`${conn.accountEmail}:${apiToken}`).toString('base64');
      const PAGE_SIZE = 100;
      const recentIssues: jiraClient.JiraIssue[] = [];
      let pageToken: string | undefined;

      do {
        const url = `${base}/rest/api/3/search/jql`;

        const bodyObj: Record<string, unknown> = {
          jql: jqlBase,
          maxResults: PAGE_SIZE,
          fields: ['summary', 'description', 'issuetype', 'status', 'priority', 'labels', 'duedate', 'resolutiondate', 'created', 'updated', 'parent'],
        };
        if (pageToken) bodyObj.nextPageToken = pageToken;

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(bodyObj),
        });

        if (!response.ok) {
          await writeSyncLog({
            connectionId,
            ventureId: venture.id,
            eventType: 'reconciliation',
            level: 'error',
            message: `Failed to fetch recent issues for project ${venture.jiraProjectKey}: HTTP ${response.status}`,
          });
          break;
        }

        const body = await response.json() as { issues: jiraClient.JiraIssue[]; total: number; nextPageToken?: string };
        recentIssues.push(...(body.issues ?? []));
        pageToken = body.nextPageToken;
      } while (pageToken);

      for (const issue of recentIssues) {
        const newHash = computeSyncHash(issue);

        // Look up existing mapping
        const [mapping] = await db
          .select()
          .from(jiraSyncMappings)
          .where(
            and(
              eq(jiraSyncMappings.connectionId, connectionId),
              eq(jiraSyncMappings.jiraEntityType, 'issue'),
              eq(jiraSyncMappings.jiraEntityId, issue.id),
            )
          )
          .limit(1);

        if (!mapping) {
          // New issue not yet in ORBIT — create it
          await handleNewIssueFromWebhook(
            issue, connectionId, venture.id, venture.targetEndDate, syncUserId, customMappings
          );
          continue;
        }

        // Check hash — skip if unchanged
        if (mapping.syncHash === newHash) continue;

        // Apply update
        await applyIssueUpdate(issue, mapping, syncUserId, venture.targetEndDate, customMappings);

        // Update sync hash
        await db
          .update(jiraSyncMappings)
          .set({ syncHash: newHash, syncedAt: new Date() })
          .where(eq(jiraSyncMappings.id, mapping.id));

        await writeSyncLog({
          connectionId,
          ventureId: venture.id,
          eventType: 'reconciliation',
          level: 'info',
          message: `Reconciled ${mapping.orbitEntityType} ${mapping.orbitEntityId} from Jira issue ${issue.key}`,
          jiraEntityType: 'issue',
          jiraEntityId: issue.id,
          orbitEntityType: mapping.orbitEntityType,
          orbitEntityId: mapping.orbitEntityId,
        });
      }

      await writeSyncLog({
        connectionId,
        ventureId: venture.id,
        eventType: 'reconciliation',
        level: 'info',
        message: `Reconciliation complete for venture ${venture.id} (${venture.jiraProjectKey}). ${recentIssues.length} issues checked.`,
      });
    } catch (ventureErr) {
      await writeSyncLog({
        connectionId,
        ventureId: venture.id,
        eventType: 'reconciliation',
        level: 'error',
        message: `Reconciliation failed for venture ${venture.id}: ${(ventureErr as Error).message}`,
      });
    }
  }
}

// ── Issue apply helpers ────────────────────────────────────────

export async function applyIssueUpdate(
  issue: jiraClient.JiraIssue,
  mapping: { orbitEntityType: string; orbitEntityId: string },
  syncUserId: string,
  fallbackDueDate: string,
  customMappings: Record<string, string>,
): Promise<void> {
  // Fix #12: Never update a soft-deleted entity. The `AND deletedInJira=false`
  // guard on every UPDATE ensures that if a Jira `issue_deleted` event already
  // soft-deleted the entity, a late-arriving `issue_updated` event cannot
  // resurrect it by writing new field values.
  if (mapping.orbitEntityType === 'workstream') {
    const wsShape = mapEpicToWorkstream(issue, '', 0, customMappings);
    await db
      .update(workstreams)
      .set({
        name: wsShape.name,
        status: wsShape.status,
        completionPct: wsShape.completionPct,
        updatedAt: new Date(),
      })
      .where(and(eq(workstreams.id, mapping.orbitEntityId), eq(workstreams.deletedInJira, false)));
  } else if (mapping.orbitEntityType === 'milestone') {
    const msShape = mapIssueToMilestone(issue, mapping.orbitEntityId, fallbackDueDate, customMappings);
    await db
      .update(milestones)
      .set({
        name: msShape.name,
        dueDate: msShape.dueDate,
        actualCompletionDate: msShape.actualCompletionDate ?? null,
        status: msShape.status,
        updatedAt: new Date(),
      })
      .where(and(eq(milestones.id, mapping.orbitEntityId), eq(milestones.deletedInJira, false)));
  } else if (mapping.orbitEntityType === 'risk') {
    const riskShape = mapIssueToRisk(issue, '', syncUserId, customMappings);
    await db
      .update(risks)
      .set({
        title: riskShape.title,
        description: riskShape.description ?? null,
        status: riskShape.status,
        updatedAt: new Date(),
      })
      .where(and(eq(risks.id, mapping.orbitEntityId), eq(risks.deletedInJira, false)));
  } else if (mapping.orbitEntityType === 'issue') {
    const issueShape = mapIssueToIssue(issue, '', syncUserId, customMappings);
    await db
      .update(issues)
      .set({
        title: issueShape.title,
        description: issueShape.description ?? null,
        status: issueShape.status,
        updatedAt: new Date(),
      })
      .where(and(eq(issues.id, mapping.orbitEntityId), eq(issues.deletedInJira, false)));
  }
}

export async function handleNewIssueFromWebhook(
  issue: jiraClient.JiraIssue,
  connectionId: string,
  ventureId: string,
  fallbackDueDate: string,
  syncUserId: string,
  customMappings: Record<string, string>,
): Promise<void> {
  const classification = classifyIssue(issue);

  if (classification === 'milestone') {
    // Need parent epic → workstream mapping
    const parentEpicId = issue.fields.parent?.id ?? issue.fields.epic?.id;
    if (!parentEpicId) return; // Can't create milestone without workstream

    const [epicMapping] = await db
      .select()
      .from(jiraSyncMappings)
      .where(
        and(
          eq(jiraSyncMappings.connectionId, connectionId),
          eq(jiraSyncMappings.jiraEntityType, 'epic'),
          eq(jiraSyncMappings.jiraEntityId, parentEpicId),
        )
      )
      .limit(1);

    if (!epicMapping) return;

    const msShape = mapIssueToMilestone(issue, epicMapping.orbitEntityId, fallbackDueDate, customMappings);
    const [ms] = await db.insert(milestones).values(msShape).returning();

    await db.insert(jiraSyncMappings).values({
      connectionId,
      jiraEntityType: 'issue',
      jiraEntityId: issue.id,
      orbitEntityType: 'milestone',
      orbitEntityId: ms.id,
      syncHash: computeSyncHash(issue),
    }).onConflictDoNothing();
  } else if (classification === 'risk') {
    const riskShape = mapIssueToRisk(issue, ventureId, syncUserId, customMappings);
    const [risk] = await db.insert(risks).values(riskShape).returning();

    await db.insert(jiraSyncMappings).values({
      connectionId,
      jiraEntityType: 'issue',
      jiraEntityId: issue.id,
      orbitEntityType: 'risk',
      orbitEntityId: risk.id,
      syncHash: computeSyncHash(issue),
    }).onConflictDoNothing();
  } else if (classification === 'issue') {
    const issueShape = mapIssueToIssue(issue, ventureId, syncUserId, customMappings);
    const [orbitIssue] = await db.insert(issues).values(issueShape).returning();

    await db.insert(jiraSyncMappings).values({
      connectionId,
      jiraEntityType: 'issue',
      jiraEntityId: issue.id,
      orbitEntityType: 'issue',
      orbitEntityId: orbitIssue.id,
      syncHash: computeSyncHash(issue),
    }).onConflictDoNothing();
  }
}

// ── Soft-delete on Jira deletion (FR-036) ─────────────────────

export async function softDeleteOrbitEntity(
  orbitEntityType: string,
  orbitEntityId: string,
): Promise<void> {
  switch (orbitEntityType) {
    case 'workstream':
      await db.update(workstreams).set({ deletedInJira: true, updatedAt: new Date() }).where(eq(workstreams.id, orbitEntityId));
      break;
    case 'milestone':
      await db.update(milestones).set({ deletedInJira: true, updatedAt: new Date() }).where(eq(milestones.id, orbitEntityId));
      break;
    case 'risk':
      await db.update(risks).set({ deletedInJira: true, updatedAt: new Date() }).where(eq(risks.id, orbitEntityId));
      break;
    case 'issue':
      await db.update(issues).set({ deletedInJira: true, updatedAt: new Date() }).where(eq(issues.id, orbitEntityId));
      break;
  }
}

// ── Job lifecycle ──────────────────────────────────────────────

/**
 * Starts the reconciliation interval. Call from server startup after DB is ready.
 */
export function startReconciliationJob(): void {
  if (reconciliationTimer) {
    console.warn('[reconciliation] Job already running — ignoring duplicate start call.');
    return;
  }

  console.log('[reconciliation] Starting 15-minute reconciliation job.');

  reconciliationTimer = setInterval(async () => {
    console.log('[reconciliation] Tick — checking active Jira connections…');
    try {
      const activeConnections = await db
        .select({ id: jiraConnections.id })
        .from(jiraConnections)
        .where(eq(jiraConnections.status, 'connected'));

      for (const conn of activeConnections) {
        await reconcileConnection(conn.id).catch((err) => {
          console.error(`[reconciliation] Error for connection ${conn.id}:`, err);
        });
      }
    } catch (err) {
      console.error('[reconciliation] Fatal error during reconciliation tick:', err);
    }
  }, RECONCILIATION_INTERVAL_MS);
}

/**
 * Stops the reconciliation interval. Call on server shutdown.
 */
export function stopReconciliationJob(): void {
  if (reconciliationTimer) {
    clearInterval(reconciliationTimer);
    reconciliationTimer = null;
    console.log('[reconciliation] Job stopped.');
  }
}
