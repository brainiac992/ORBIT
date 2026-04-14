/**
 * Jira import orchestrator.
 * Implements the hard-delete-then-recreate import pipeline.
 *
 * Sequence:
 *   1. Acquire import lock
 *   2. Hard-delete all venture data (FK-order)
 *   3. Clear sync mappings + log for this connection
 *   4. Fetch all Jira projects
 *   5. For each project: create venture → epics → workstreams → issues → progress updates
 *   6. Write sync mappings
 *   7. Write success log entry
 *   8. Release import lock
 *
 * On any error: release lock, write error log, re-throw.
 */

import { db } from '../db/index.js';
import { eq, and, inArray, sql, desc } from 'drizzle-orm';
import {
  jiraConnections,
  jiraSyncMappings,
  jiraSyncLog,
  ventures,
  workstreams,
  milestones,
  risks,
  issues,
  progressUpdates,
  users,
  resourceAssignments,
  budgetEntries,
  budgetForecasts,
  taskDependencies,
  workstreamRaciAssignments,
  workstreamUpdates,
  milestoneCompletions,
  approvals,
  auditTrail,
  venturePlans,
  artifacts,
  decisions,
  blockers,
  jiraStatusMappings,
} from '../db/schema.js';
import { decryptToken } from './encryption.js';
import * as jiraClient from './jiraClient.js';
import {
  mapProjectToVenture,
  mapEpicToWorkstream,
  mapIssueToMilestone,
  mapIssueToRisk,
  mapIssueToIssue,
  mapCommentToProgressUpdate,
  classifyIssue,
  computeSyncHash,
  isoDateOnly,
} from './jiraMappers.js';
import { logAudit } from './audit.js';

const SYNC_USER_OID = 'sync-system-001';

// ── Import job state (in-memory per process) ───────────────────

export interface ImportStatus {
  jobId: string;
  phase: string;
  processed: number;
  total: number;
  errors: string[];
  completedAt?: Date;
  failed?: boolean;
}

const importJobs = new Map<string, ImportStatus>();

export function getImportStatus(jobId: string): ImportStatus | undefined {
  return importJobs.get(jobId);
}

function makeJobId(): string {
  return `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Sync system user lookup ─────────────────────────────────────

async function getSyncUserId(): Promise<string> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.azureOid, SYNC_USER_OID))
    .limit(1);

  if (existing) return existing.id;

  // Auto-create the sync system user if it doesn't exist
  const [created] = await db.insert(users).values({
    azureOid: SYNC_USER_OID,
    email: 'sync@orbit.internal',
    name: 'Jira Sync',
    role: 'pmo',
  }).returning({ id: users.id });

  console.log('[jiraImport] Auto-created sync system user: sync@orbit.internal');
  return created.id;
}

// ── Custom status mapping lookup ────────────────────────────────

async function getCustomMappings(connectionId: string): Promise<Record<string, string>> {
  const rows = await db
    .select({ jiraStatusName: jiraStatusMappings.jiraStatusName, orbitStatus: jiraStatusMappings.orbitStatus })
    .from(jiraStatusMappings)
    .where(eq(jiraStatusMappings.connectionId, connectionId));

  return Object.fromEntries(rows.map((r) => [r.jiraStatusName, r.orbitStatus]));
}

// ── Hard delete (dependency-ordered) ──────────────────────────

async function hardDeleteAllVentureData(): Promise<void> {
  // Delete in FK dependency order to avoid constraint violations.
  // Child tables first, parent tables last.
  await db.delete(milestoneCompletions);
  await db.delete(workstreamUpdates);
  await db.delete(blockers);
  await db.delete(decisions);
  await db.delete(budgetEntries);
  await db.delete(budgetForecasts);
  await db.delete(taskDependencies);
  await db.delete(workstreamRaciAssignments);
  await db.delete(milestones);
  await db.delete(workstreams);
  await db.delete(resourceAssignments);
  await db.delete(progressUpdates);
  await db.delete(risks);
  await db.delete(issues);
  await db.delete(approvals);
  await db.delete(auditTrail);
  await db.delete(venturePlans);
  await db.delete(artifacts);
  await db.delete(jiraSyncLog);
  await db.delete(jiraSyncMappings);
  await db.delete(ventures);
}

async function clearSyncDataForConnection(connectionId: string): Promise<void> {
  await db.delete(jiraSyncMappings).where(eq(jiraSyncMappings.connectionId, connectionId));
  await db.delete(jiraSyncLog).where(eq(jiraSyncLog.connectionId, connectionId));
}

// ── Delta cursor ────────────────────────────────────────────────

/**
 * Returns the timestamp of the last successful import for this connection,
 * or null if no import has ever completed successfully.
 */
async function getLastImportAt(connectionId: string): Promise<Date | null> {
  const [row] = await db
    .select({ lastImportAt: jiraConnections.lastImportAt })
    .from(jiraConnections)
    .where(eq(jiraConnections.id, connectionId))
    .limit(1);
  return row?.lastImportAt ?? null;
}

/**
 * Converts a Date to the Jira JQL datetime string format: "YYYY-MM-DD HH:MM".
 * Subtracts 5 minutes as a buffer to avoid missing items on clock skew.
 */
function toJqlDateTime(date: Date): string {
  const d = new Date(date.getTime() - 5 * 60 * 1000);
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

// ── Sync log helper ─────────────────────────────────────────────

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

// ── Sync mapping upsert ─────────────────────────────────────────

async function writeSyncMapping(opts: {
  connectionId: string;
  jiraEntityType: string;
  jiraEntityId: string;
  orbitEntityType: string;
  orbitEntityId: string;
  syncHash?: string;
}): Promise<void> {
  await db
    .insert(jiraSyncMappings)
    .values({
      connectionId: opts.connectionId,
      jiraEntityType: opts.jiraEntityType,
      jiraEntityId: opts.jiraEntityId,
      orbitEntityType: opts.orbitEntityType,
      orbitEntityId: opts.orbitEntityId,
      syncHash: opts.syncHash ?? null,
    })
    .onConflictDoUpdate({
      target: [
        jiraSyncMappings.connectionId,
        jiraSyncMappings.jiraEntityType,
        jiraSyncMappings.jiraEntityId,
      ],
      set: {
        orbitEntityId: opts.orbitEntityId,
        syncHash: opts.syncHash ?? null,
        syncedAt: new Date(),
      },
    });
}

// ── Date helpers ────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── Main import function ────────────────────────────────────────

/**
 * Triggers an import in the background. Returns the job ID immediately.
 * force=true skips delta mode and runs a full wipe-and-reimport.
 */
export function triggerImport(connectionId: string, force = false): string {
  const jobId = makeJobId();
  const status: ImportStatus = {
    jobId,
    phase: 'Initialising…',
    processed: 0,
    total: 0,
    errors: [],
  };
  importJobs.set(jobId, status);

  // Run async without awaiting — caller gets the jobId for polling
  runFullImport(connectionId, jobId, force).catch((err) => {
    const job = importJobs.get(jobId);
    if (job) {
      job.phase = 'Failed';
      job.failed = true;
      job.errors.push((err as Error).message);
      job.completedAt = new Date();
    }
  });

  return jobId;
}

/**
 * Core import orchestrator. Called by triggerImport.
 * - force=false (default): delta mode when a prior import exists — only fetches items
 *   updated since the last import, upserts via syncHash, no hard delete.
 * - force=true: wipe-and-reimport regardless of prior state.
 * All errors are caught, logged, and re-thrown.
 */
export async function runFullImport(connectionId: string, jobId: string, force = false): Promise<void> {
  const job = importJobs.get(jobId)!;

  function updateJob(phase: string, processed?: number, total?: number) {
    job.phase = phase;
    if (processed !== undefined) job.processed = processed;
    if (total !== undefined) job.total = total;
  }

  // ── Step 1: Acquire import lock (atomic conditional UPDATE) ──
  // Using a single UPDATE ... WHERE import_lock=false prevents the TOCTOU race
  // that would occur with a separate read-then-write pattern. If another process
  // has already set the lock, 0 rows are updated and we throw immediately.
  const locked = await db
    .update(jiraConnections)
    .set({ importLock: true, updatedAt: new Date() })
    .where(and(eq(jiraConnections.id, connectionId), eq(jiraConnections.importLock, false)))
    .returning({ id: jiraConnections.id });

  if (locked.length === 0) {
    // Either the connection doesn't exist, or another import already holds the lock.
    const [conn2] = await db
      .select({ id: jiraConnections.id })
      .from(jiraConnections)
      .where(eq(jiraConnections.id, connectionId))
      .limit(1);
    if (!conn2) {
      throw new Error(`Jira connection ${connectionId} not found.`);
    }
    throw new Error('Import already in progress for this connection. Wait for it to complete before starting another.');
  }

  const [conn] = await db
    .select()
    .from(jiraConnections)
    .where(eq(jiraConnections.id, connectionId))
    .limit(1);

  if (!conn) {
    // Defensive: should never happen since we just locked the row
    throw new Error(`Jira connection ${connectionId} not found after lock acquisition.`);
  }

  const syncUserId = await getSyncUserId();
  const apiToken = decryptToken(conn.apiTokenEncrypted);
  const customMappings = await getCustomMappings(connectionId);

  try {
    updateJob('Validating Jira connection…');
    const authCheck = await jiraClient.testConnection(conn.instanceUrl, conn.accountEmail, apiToken);
    if (!authCheck.success) {
      throw new Error(`Jira authentication failed: ${authCheck.error}`);
    }

    // ── Step 2: Determine mode (delta vs full) ───────────────
    const lastImportAt = await getLastImportAt(connectionId);
    const isDeltaMode = !force && lastImportAt !== null;
    const updatedSince = isDeltaMode ? toJqlDateTime(lastImportAt!) : undefined;

    if (!isDeltaMode) {
      // Full mode: wipe all existing data first
      updateJob('Clearing existing ORBIT data…');
      await hardDeleteAllVentureData();
      await clearSyncDataForConnection(connectionId);
    } else {
      updateJob(`Delta sync — importing changes since ${lastImportAt!.toISOString()}…`);
    }

    // ── Step 3: Fetch Jira projects (filtered) ────────────────
    updateJob('Fetching Jira projects…');
    let projects = await jiraClient.getProjects(conn.instanceUrl, conn.accountEmail, apiToken);

    // Apply project key filter (SHAR only by default if configured)
    if (conn.projectKeyFilter) {
      const allowedKeys = conn.projectKeyFilter.split(',').map((k: string) => k.trim().toUpperCase());
      projects = projects.filter(p => allowedKeys.includes(p.key.toUpperCase()));
    }

    updateJob('Fetching Jira projects…', 0, projects.length);

    if (projects.length === 0) {
      await writeSyncLog({
        connectionId,
        eventType: 'import',
        level: 'warning',
        message: conn.projectKeyFilter
          ? `Import completed but no matching Jira projects found for filter: ${conn.projectKeyFilter}.`
          : 'Import completed but no Jira projects were found. ORBIT is now empty.',
      });
      updateJob('Complete — no projects found', 0, 0);
      job.completedAt = new Date();
      return;
    }

    // ── Step 4: Process each project ─────────────────────────
    let projectsProcessed = 0;

    for (const project of projects) {
      updateJob(`Importing project ${projectsProcessed + 1} of ${projects.length}: ${project.key}`, projectsProcessed, projects.length);

      try {
        // ── 4a: Resolve or create venture ──────────────────
        let venture: typeof ventures.$inferSelect;

        if (isDeltaMode) {
          // Look up existing venture via sync mappings
          const [existingMapping] = await db
            .select({ orbitEntityId: jiraSyncMappings.orbitEntityId })
            .from(jiraSyncMappings)
            .where(and(
              eq(jiraSyncMappings.connectionId, connectionId),
              eq(jiraSyncMappings.jiraEntityType, 'project'),
              eq(jiraSyncMappings.jiraEntityId, project.id),
            ))
            .limit(1);

          if (existingMapping) {
            const [existing] = await db
              .select()
              .from(ventures)
              .where(eq(ventures.id, existingMapping.orbitEntityId))
              .limit(1);
            if (existing) {
              venture = existing;
            } else {
              // Mapping orphaned — create venture fresh
              venture = await createVentureForProject(project, connectionId, syncUserId, customMappings, apiToken, conn);
            }
          } else {
            venture = await createVentureForProject(project, connectionId, syncUserId, customMappings, apiToken, conn);
          }
        } else {
          // Full mode: always create fresh
          // Determine dates from all issues
          let earliestCreated: string | null = null;
          let latestDue: string | null = null;
          let allIssuesForProject: jiraClient.JiraIssue[] = [];
          let issuePageToken: string | undefined;
          do {
            const page = await jiraClient.getProjectIssues(
              conn.instanceUrl, conn.accountEmail, apiToken, project.key, issuePageToken
            );
            allIssuesForProject.push(...page.issues);
            issuePageToken = page.nextPageToken;
          } while (issuePageToken);

          for (const iss of allIssuesForProject) {
            const created = isoDateOnly(iss.fields.created);
            if (created && (!earliestCreated || created < earliestCreated)) earliestCreated = created;
            const due = isoDateOnly(iss.fields.duedate);
            if (due && (!latestDue || due > latestDue)) latestDue = due;
          }

          const startDate = earliestCreated ?? today();
          const targetEndDate = latestDue ?? daysFromToday(90);

          const ventureShape = mapProjectToVenture(
            project, connectionId, syncUserId, startDate, targetEndDate, customMappings
          );
          const [created] = await db.insert(ventures).values(ventureShape).returning();
          venture = created;

          await writeSyncMapping({
            connectionId,
            jiraEntityType: 'project',
            jiraEntityId: project.id,
            orbitEntityType: 'venture',
            orbitEntityId: venture.id,
          });

          await logAudit(db, {
            entityType: 'venture',
            entityId: venture.id,
            ventureId: venture.id,
            action: 'created',
            changedBy: syncUserId,
          });

          await writeSyncLog({
            connectionId,
            ventureId: venture.id,
            eventType: 'import',
            level: 'info',
            message: `Created venture '${venture.name}' from Jira project ${project.key}`,
            jiraEntityType: 'project',
            jiraEntityId: project.id,
            orbitEntityType: 'venture',
            orbitEntityId: venture.id,
          });

          // Full mode: issues already fetched above — process them below
          // Store for step 4c/4d below
          (project as any).__allIssues = allIssuesForProject;
          (project as any).__targetEndDate = targetEndDate;
        }

        // ── 4b: Build epicToWorkstreamId map ────────────────
        // In delta mode: seed from DB so all parent lookups work even for
        // unchanged epics that won't be returned by the updatedSince query.
        // In full mode: starts empty, populated as epics are created.
        const epicToWorkstreamId = new Map<string, string>();
        const workstreamCompletionPct = new Map<string, number>();

        if (isDeltaMode) {
          const epicMappings = await db
            .select({ jiraEntityId: jiraSyncMappings.jiraEntityId, orbitEntityId: jiraSyncMappings.orbitEntityId })
            .from(jiraSyncMappings)
            .where(and(
              eq(jiraSyncMappings.connectionId, connectionId),
              eq(jiraSyncMappings.jiraEntityType, 'epic'),
            ));
          for (const m of epicMappings) epicToWorkstreamId.set(m.jiraEntityId, m.orbitEntityId);
        }

        // ── 4c: Fetch epics → upsert workstreams ────────────
        const epics = await jiraClient.getEpics(
          conn.instanceUrl, conn.accountEmail, apiToken, project.key, updatedSince
        );

        // Set preliminary total from epics + any issues already in hand (full mode).
        // Delta mode will extend total after fetching updated issues below.
        const preloadedIssues: jiraClient.JiraIssue[] = (project as any).__allIssues ?? [];
        job.total = epics.length + preloadedIssues.length;
        job.processed = 0;
        updateJob(`Importing ${project.key} — 0 of ${job.total} items`, 0, job.total);

        let epicSortOrder = epicToWorkstreamId.size + 1;

        for (const epic of epics) {
          const newHash = computeSyncHash(epic);

          if (isDeltaMode) {
            const existingWsId = epicToWorkstreamId.get(epic.id);
            if (existingWsId) {
              // Check if changed
              const [existingMap] = await db
                .select({ syncHash: jiraSyncMappings.syncHash })
                .from(jiraSyncMappings)
                .where(and(
                  eq(jiraSyncMappings.connectionId, connectionId),
                  eq(jiraSyncMappings.jiraEntityType, 'epic'),
                  eq(jiraSyncMappings.jiraEntityId, epic.id),
                ))
                .limit(1);

              if (existingMap?.syncHash === newHash) {
                // Unchanged — load completionPct for venture health calc
                const [ws] = await db
                  .select({ completionPct: workstreams.completionPct })
                  .from(workstreams)
                  .where(eq(workstreams.id, existingWsId))
                  .limit(1);
                if (ws) workstreamCompletionPct.set(existingWsId, ws.completionPct);
                job.processed++;
                updateJob(`Importing ${project.key} — ${job.processed} of ${job.total} items`, job.processed, job.total);
                continue;
              }

              // Changed — update workstream
              const wsShape = mapEpicToWorkstream(epic, venture.id, epicSortOrder++, customMappings);
              await db.update(workstreams)
                .set({
                  name: wsShape.name,
                  status: wsShape.status,
                  completionPct: wsShape.completionPct,
                  baselineStart: wsShape.baselineStart,
                  baselineEnd: wsShape.baselineEnd,
                  updatedAt: new Date(),
                })
                .where(eq(workstreams.id, existingWsId));
              workstreamCompletionPct.set(existingWsId, wsShape.completionPct);
              await writeSyncMapping({
                connectionId,
                jiraEntityType: 'epic',
                jiraEntityId: epic.id,
                orbitEntityType: 'workstream',
                orbitEntityId: existingWsId,
                syncHash: newHash,
              });
            } else {
              // New epic — create workstream
              const wsShape = mapEpicToWorkstream(epic, venture.id, epicSortOrder++, customMappings);
              const [ws] = await db.insert(workstreams).values(wsShape).returning();
              epicToWorkstreamId.set(epic.id, ws.id);
              workstreamCompletionPct.set(ws.id, ws.completionPct);
              await writeSyncMapping({
                connectionId,
                jiraEntityType: 'epic',
                jiraEntityId: epic.id,
                orbitEntityType: 'workstream',
                orbitEntityId: ws.id,
                syncHash: newHash,
              });
            }
          } else {
            // Full mode — always create
            const wsShape = mapEpicToWorkstream(epic, venture.id, epicSortOrder++, customMappings);
            const [ws] = await db.insert(workstreams).values(wsShape).returning();
            epicToWorkstreamId.set(epic.id, ws.id);
            workstreamCompletionPct.set(ws.id, ws.completionPct);
            await writeSyncMapping({
              connectionId,
              jiraEntityType: 'epic',
              jiraEntityId: epic.id,
              orbitEntityType: 'workstream',
              orbitEntityId: ws.id,
              syncHash: newHash,
            });
          }
          job.processed++;
          updateJob(`Importing ${project.key} — ${job.processed} of ${job.total} items`, job.processed, job.total);
        }

        // ── 4d: Classify and upsert issues ──────────────────
        const targetEndDate: string = (project as any).__targetEndDate ?? daysFromToday(90);

        // In full mode issues were already fetched; in delta mode fetch only updated
        let allIssuesForProject: jiraClient.JiraIssue[];
        if (isDeltaMode) {
          allIssuesForProject = [];
          let issuePageToken: string | undefined;
          do {
            const page = await jiraClient.getProjectIssues(
              conn.instanceUrl, conn.accountEmail, apiToken, project.key, issuePageToken, updatedSince
            );
            allIssuesForProject.push(...page.issues);
            issuePageToken = page.nextPageToken;
          } while (issuePageToken);
          // Now we know total — extend it with the delta issue count
          job.total += allIssuesForProject.length;
        } else {
          allIssuesForProject = (project as any).__allIssues ?? [];
        }

        for (const issue of allIssuesForProject) {
          const classification = classifyIssue(issue);
          const newHash = computeSyncHash(issue);

          if (classification === 'milestone') {
            const parentEpicId = issue.fields.parent?.id ?? issue.fields.epic?.id;
            const workstreamId = parentEpicId ? epicToWorkstreamId.get(parentEpicId) : undefined;
            if (!workstreamId) {
              await writeSyncLog({
                connectionId,
                ventureId: venture.id,
                eventType: 'import',
                level: 'warning',
                message: `Issue ${issue.key} (${issue.fields.summary}) has no parent epic — skipped as milestone.`,
                jiraEntityId: issue.id,
                jiraEntityType: 'issue',
              });
              job.processed++;
              updateJob(`Importing ${project.key} — ${job.processed} of ${job.total} items`, job.processed, job.total);
              continue;
            }

            if (isDeltaMode) {
              const [existingMap] = await db
                .select({ orbitEntityId: jiraSyncMappings.orbitEntityId, syncHash: jiraSyncMappings.syncHash })
                .from(jiraSyncMappings)
                .where(and(
                  eq(jiraSyncMappings.connectionId, connectionId),
                  eq(jiraSyncMappings.jiraEntityType, 'issue'),
                  eq(jiraSyncMappings.jiraEntityId, issue.id),
                ))
                .limit(1);

              if (existingMap) {
                if (existingMap.syncHash !== newHash) {
                  const msShape = mapIssueToMilestone(issue, workstreamId, targetEndDate, customMappings);
                  await db.update(milestones)
                    .set({ name: msShape.name, status: msShape.status, dueDate: msShape.dueDate, actualCompletionDate: msShape.actualCompletionDate, updatedAt: new Date() })
                    .where(eq(milestones.id, existingMap.orbitEntityId));
                  await writeSyncMapping({ connectionId, jiraEntityType: 'issue', jiraEntityId: issue.id, orbitEntityType: 'milestone', orbitEntityId: existingMap.orbitEntityId, syncHash: newHash });
                }
                job.processed++;
                updateJob(`Importing ${project.key} — ${job.processed} of ${job.total} items`, job.processed, job.total);
                continue;
              }
            }

            const msShape = mapIssueToMilestone(issue, workstreamId, targetEndDate, customMappings);
            const [ms] = await db.insert(milestones).values(msShape).returning();
            await writeSyncMapping({ connectionId, jiraEntityType: 'issue', jiraEntityId: issue.id, orbitEntityType: 'milestone', orbitEntityId: ms.id, syncHash: newHash });

          } else if (classification === 'risk') {
            if (isDeltaMode) {
              const [existingMap] = await db
                .select({ orbitEntityId: jiraSyncMappings.orbitEntityId, syncHash: jiraSyncMappings.syncHash })
                .from(jiraSyncMappings)
                .where(and(
                  eq(jiraSyncMappings.connectionId, connectionId),
                  eq(jiraSyncMappings.jiraEntityType, 'issue'),
                  eq(jiraSyncMappings.jiraEntityId, issue.id),
                ))
                .limit(1);

              if (existingMap) {
                if (existingMap.syncHash !== newHash) {
                  const riskShape = mapIssueToRisk(issue, venture.id, syncUserId, customMappings);
                  await db.update(risks)
                    .set({ title: riskShape.title, status: riskShape.status, updatedAt: new Date() })
                    .where(eq(risks.id, existingMap.orbitEntityId));
                  await writeSyncMapping({ connectionId, jiraEntityType: 'issue', jiraEntityId: issue.id, orbitEntityType: 'risk', orbitEntityId: existingMap.orbitEntityId, syncHash: newHash });
                }
                job.processed++;
                updateJob(`Importing ${project.key} — ${job.processed} of ${job.total} items`, job.processed, job.total);
                continue;
              }
            }

            const riskShape = mapIssueToRisk(issue, venture.id, syncUserId, customMappings);
            const [risk] = await db.insert(risks).values(riskShape).returning();
            await writeSyncMapping({ connectionId, jiraEntityType: 'issue', jiraEntityId: issue.id, orbitEntityType: 'risk', orbitEntityId: risk.id, syncHash: newHash });

          } else if (classification === 'issue') {
            if (isDeltaMode) {
              const [existingMap] = await db
                .select({ orbitEntityId: jiraSyncMappings.orbitEntityId, syncHash: jiraSyncMappings.syncHash })
                .from(jiraSyncMappings)
                .where(and(
                  eq(jiraSyncMappings.connectionId, connectionId),
                  eq(jiraSyncMappings.jiraEntityType, 'issue'),
                  eq(jiraSyncMappings.jiraEntityId, issue.id),
                ))
                .limit(1);

              if (existingMap) {
                if (existingMap.syncHash !== newHash) {
                  const issueShape = mapIssueToIssue(issue, venture.id, syncUserId, customMappings);
                  await db.update(issues)
                    .set({ title: issueShape.title, status: issueShape.status, updatedAt: new Date() })
                    .where(eq(issues.id, existingMap.orbitEntityId));
                  await writeSyncMapping({ connectionId, jiraEntityType: 'issue', jiraEntityId: issue.id, orbitEntityType: 'issue', orbitEntityId: existingMap.orbitEntityId, syncHash: newHash });
                }
                job.processed++;
                updateJob(`Importing ${project.key} — ${job.processed} of ${job.total} items`, job.processed, job.total);
                continue;
              }
            }

            const issueShape = mapIssueToIssue(issue, venture.id, syncUserId, customMappings);
            const [orbitIssue] = await db.insert(issues).values(issueShape).returning();
            await writeSyncMapping({ connectionId, jiraEntityType: 'issue', jiraEntityId: issue.id, orbitEntityType: 'issue', orbitEntityId: orbitIssue.id, syncHash: newHash });
          }
          // 'skip' — do nothing
          job.processed++;
          updateJob(`Importing ${project.key} — ${job.processed} of ${job.total} items`, job.processed, job.total);
        }

        // ── 5e: Fetch epic comments → progress updates ───────
        for (const epic of epics) {
          const wsId = epicToWorkstreamId.get(epic.id);
          if (!wsId) continue;
          const completionPct = workstreamCompletionPct.get(wsId) ?? 0;

          try {
            const comments = await jiraClient.getIssueComments(
              conn.instanceUrl, conn.accountEmail, apiToken, epic.key
            );

            for (const comment of comments) {
              const puShape = mapCommentToProgressUpdate(comment, venture.id, syncUserId, completionPct);
              await db.insert(progressUpdates).values(puShape);
            }
          } catch (commentErr) {
            await writeSyncLog({
              connectionId,
              ventureId: venture.id,
              eventType: 'import',
              level: 'warning',
              message: `Failed to fetch comments for epic ${epic.key}: ${(commentErr as Error).message}`,
              jiraEntityType: 'epic',
              jiraEntityId: epic.id,
            });
          }
        }

        // ── 5f: Compute venture health & completion from workstreams ──
        const ventureWsList = await db
          .select({ status: workstreams.status, completionPct: workstreams.completionPct })
          .from(workstreams)
          .where(eq(workstreams.ventureId, venture.id));

        if (ventureWsList.length > 0) {
          const avgCompletion = Math.round(
            ventureWsList.reduce((sum, ws) => sum + ws.completionPct, 0) / ventureWsList.length
          );
          const allComplete = ventureWsList.every(ws => ws.status === 'complete');
          const anyOffTrack = ventureWsList.some(ws => ws.status === 'on_hold');
          const anyAtRisk = ventureWsList.some(ws => ws.completionPct < 30 && ws.status === 'in_progress');

          let health: 'on_track' | 'at_risk' | 'off_track' | 'complete' = 'on_track';
          if (allComplete) health = 'complete';
          else if (anyOffTrack) health = 'off_track';
          else if (anyAtRisk) health = 'at_risk';

          let ventureStatus: 'planning' | 'active' | 'on_hold' | 'complete' | 'archived' = 'active';
          if (allComplete) ventureStatus = 'complete';

          await db.update(ventures).set({
            completionPct: avgCompletion,
            health,
            status: ventureStatus,
            updatedAt: new Date(),
          }).where(eq(ventures.id, venture.id));
        }

        projectsProcessed++;
        updateJob(`Imported project ${projectsProcessed} of ${projects.length}`, projectsProcessed, projects.length);
      } catch (projectErr) {
        const errMsg = (projectErr as Error).message;
        // HTTP 400 = no search access to this project — skip with warning, not error
        if (errMsg.includes('HTTP 400')) {
          await writeSyncLog({
            connectionId,
            eventType: 'import',
            level: 'warning',
            message: `Skipped project ${project.key} — no search access.`,
            jiraEntityType: 'project',
            jiraEntityId: project.id,
          });
        } else {
          const msg = `Failed to import project ${project.key}: ${errMsg}`;
          job.errors.push(msg);
          await writeSyncLog({
            connectionId,
            eventType: 'import',
            level: 'error',
            message: msg,
            jiraEntityType: 'project',
            jiraEntityId: project.id,
          });
        }
      }
    }

    // ── Step 7: Write completion log and set final job state ──
    // If any per-project errors occurred, mark the job as failed. A partial
    // import is an integrity failure — the PMO admin must be informed and
    // offered the Retry Import action. We never report partial success as green.
    if (job.errors.length > 0) {
      const errMsg = `Import completed with ${job.errors.length} project error(s). ${projectsProcessed} of ${projects.length} projects imported successfully.`;
      await writeSyncLog({
        connectionId,
        eventType: 'import',
        level: 'error',
        message: errMsg,
        payload: { projectsTotal: projects.length, projectsImported: projectsProcessed, errors: job.errors },
      });

      await db
        .update(jiraConnections)
        .set({ lastError: errMsg, updatedAt: new Date() })
        .where(eq(jiraConnections.id, connectionId));

      job.failed = true;
      updateJob('Failed — partial import', projectsProcessed, projects.length);
      job.completedAt = new Date();
      // Throw so the outer catch path releases the lock and propagates failed state
      throw new Error(errMsg);
    }

    // Verify ventures actually exist in DB after import
    const [ventureCountCheck] = await db.select({ count: sql`count(*)::int` }).from(ventures);
    console.log(`[jiraImport] Import done. ${projectsProcessed} projects processed. DB venture count: ${ventureCountCheck?.count ?? 'unknown'}`);

    const importMode = isDeltaMode ? 'delta' : 'full';
    await writeSyncLog({
      connectionId,
      eventType: 'import',
      level: 'info',
      message: `${importMode === 'delta' ? 'Delta' : 'Full'} import complete. ${projectsProcessed} of ${projects.length} projects processed. ${ventureCountCheck?.count ?? 0} ventures in database.`,
      payload: { importMode, projectsTotal: projects.length, projectsImported: projectsProcessed, dbVentureCount: ventureCountCheck?.count },
    });

    // Stamp lastImportAt so future runs can delta from this point
    await db
      .update(jiraConnections)
      .set({ lastValidatedAt: new Date(), lastImportAt: new Date(), lastError: null, updatedAt: new Date() })
      .where(eq(jiraConnections.id, connectionId));

    updateJob('Complete', projectsProcessed, projects.length);
    job.completedAt = new Date();
  } catch (err) {
    // ── Error path: release lock, write error log, re-throw ──
    const errorMsg = (err as Error).message;
    job.errors.push(errorMsg);
    job.failed = true;
    job.phase = 'Failed';

    await writeSyncLog({
      connectionId,
      eventType: 'import',
      level: 'error',
      message: `Import failed: ${errorMsg}`,
    }).catch(() => { /* best-effort — don't throw if log write fails */ });

    await db
      .update(jiraConnections)
      .set({ lastError: errorMsg, updatedAt: new Date() })
      .where(eq(jiraConnections.id, connectionId))
      .catch(() => { /* best-effort */ });

    throw err;
  } finally {
    // ── Step 8: Always release import lock ───────────────────
    await db
      .update(jiraConnections)
      .set({ importLock: false, updatedAt: new Date() })
      .where(eq(jiraConnections.id, connectionId))
      .catch((e) => console.error('[jiraImport] Failed to release import lock:', e));
  }
}

// ── Venture creation helper ─────────────────────────────────────

/**
 * Fetches issues to determine project dates, creates the venture record,
 * writes a sync mapping, and returns the venture. Used in both full mode
 * and when a project has no existing mapping in delta mode.
 */
async function createVentureForProject(
  project: jiraClient.JiraProject,
  connectionId: string,
  syncUserId: string,
  customMappings: Record<string, string>,
  apiToken: string,
  conn: { instanceUrl: string; accountEmail: string },
): Promise<typeof ventures.$inferSelect> {
  let earliestCreated: string | null = null;
  let latestDue: string | null = null;
  let issuePageToken: string | undefined;
  do {
    const page = await jiraClient.getProjectIssues(conn.instanceUrl, conn.accountEmail, apiToken, project.key, issuePageToken);
    for (const iss of page.issues) {
      const created = isoDateOnly(iss.fields.created);
      if (created && (!earliestCreated || created < earliestCreated)) earliestCreated = created;
      const due = isoDateOnly(iss.fields.duedate);
      if (due && (!latestDue || due > latestDue)) latestDue = due;
    }
    issuePageToken = page.nextPageToken;
  } while (issuePageToken);

  const startDate = earliestCreated ?? today();
  const targetEndDate = latestDue ?? daysFromToday(90);

  const ventureShape = mapProjectToVenture(project, connectionId, syncUserId, startDate, targetEndDate, customMappings);
  const [venture] = await db.insert(ventures).values(ventureShape).returning();

  await writeSyncMapping({
    connectionId,
    jiraEntityType: 'project',
    jiraEntityId: project.id,
    orbitEntityType: 'venture',
    orbitEntityId: venture.id,
  });
  await logAudit(db, { entityType: 'venture', entityId: venture.id, ventureId: venture.id, action: 'created', changedBy: syncUserId });
  await writeSyncLog({
    connectionId,
    ventureId: venture.id,
    eventType: 'import',
    level: 'info',
    message: `Created venture '${venture.name}' from Jira project ${project.key}`,
    jiraEntityType: 'project',
    jiraEntityId: project.id,
    orbitEntityType: 'venture',
    orbitEntityId: venture.id,
  });
  return venture;
}

// ── Daily auto-sync scheduler ───────────────────────────────────

/**
 * Schedules a daily delta import at 07:00 UAE time (03:00 UTC).
 * Self-rescheduling via setTimeout — no external dependency needed.
 * Called once at server startup.
 */
export function startDailyImportJob(): void {
  function msUntilNext3amUtc(): number {
    const now = new Date();
    const next = new Date();
    next.setUTCHours(3, 0, 0, 0);
    if (next.getTime() <= now.getTime()) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next.getTime() - now.getTime();
  }

  async function runAndReschedule(): Promise<void> {
    try {
      const [conn] = await db
        .select()
        .from(jiraConnections)
        .where(eq(jiraConnections.status, 'connected'))
        .limit(1);

      if (!conn) {
        console.log('[jiraImport] Daily auto-sync: no active Jira connection — skipping.');
      } else if (conn.importLock) {
        console.log('[jiraImport] Daily auto-sync: import already in progress — skipping.');
      } else {
        const jobId = triggerImport(conn.id); // force=false → delta mode
        console.log(`[jiraImport] Daily auto-sync triggered. jobId=${jobId}`);
      }
    } catch (err) {
      console.error('[jiraImport] Daily auto-sync error:', (err as Error).message);
    } finally {
      // Always reschedule for the next day
      const delay = msUntilNext3amUtc();
      console.log(`[jiraImport] Next auto-sync in ${Math.round(delay / 3600000 * 10) / 10}h (${new Date(Date.now() + delay).toISOString()})`);
      setTimeout(runAndReschedule, delay);
    }
  }

  const delay = msUntilNext3amUtc();
  console.log(`[jiraImport] Daily auto-sync scheduled. First run at ${new Date(Date.now() + delay).toISOString()} (7:00 AM UAE)`);
  setTimeout(runAndReschedule, delay);
}

// ── Import preview (read-only, no side effects) ─────────────────

export async function getImportPreview(connectionId: string): Promise<{
  toDelete: {
    ventures: number;
    workstreams: number;
    milestones: number;
    risks: number;
    issues: number;
    progressUpdates: number;
  };
  toCreate: {
    projects: number;
    epics: number;
    stories: number;
    riskIssues: number;
    blockerIssues: number;
  };
}> {
  const [conn] = await db
    .select()
    .from(jiraConnections)
    .where(eq(jiraConnections.id, connectionId))
    .limit(1);

  if (!conn) throw new Error(`Jira connection ${connectionId} not found.`);

  const apiToken = decryptToken(conn.apiTokenEncrypted);

  // Count existing ORBIT records
  const { count: countQuery } = await import('drizzle-orm');

  const [ventureCount] = await db.select({ count: countQuery() }).from(ventures);
  const [workstreamCount] = await db.select({ count: countQuery() }).from(workstreams);
  const [milestoneCount] = await db.select({ count: countQuery() }).from(milestones);
  const [riskCount] = await db.select({ count: countQuery() }).from(risks);
  const [issueCount] = await db.select({ count: countQuery() }).from(issues);
  const [progressCount] = await db.select({ count: countQuery() }).from(progressUpdates);

  // Count what Jira has (high-level scan — filtered to projectKeyFilter if set)
  let projects = await jiraClient.getProjects(conn.instanceUrl, conn.accountEmail, apiToken);
  if (conn.projectKeyFilter) {
    const allowedKeys = conn.projectKeyFilter.split(',').map((k: string) => k.trim().toUpperCase());
    projects = projects.filter(p => allowedKeys.includes(p.key.toUpperCase()));
  }
  let epicCount = 0;
  let storyCount = 0;
  let riskIssueCount = 0;
  let blockerCount = 0;
  let skippedProjects = 0;

  for (const project of projects) {
    try {
    // First page only for preview speed — use total for accurate count
    const epics = await jiraClient.getEpics(conn.instanceUrl, conn.accountEmail, apiToken, project.key);
    epicCount += epics.length;

    const firstPage = await jiraClient.getProjectIssues(
      conn.instanceUrl, conn.accountEmail, apiToken, project.key
    );

    // Classify the first page sample, extrapolate from total
    for (const iss of firstPage.issues) {
      const { classifyIssue: cls } = await import('./jiraMappers.js');
      const c = cls(iss);
      if (c === 'milestone') storyCount++;
      else if (c === 'risk') riskIssueCount++;
      else if (c === 'issue') blockerCount++;
    }
    // Add remaining unscanned issues to story count as estimate
    const remaining = firstPage.total - firstPage.issues.length;
    if (remaining > 0) storyCount += remaining;
    } catch (err) {
      console.warn(`[importPreview] Skipping project ${project.key}: ${(err as Error).message}`);
      skippedProjects++;
    }
  }

  return {
    toDelete: {
      ventures: Number(ventureCount?.count ?? 0),
      workstreams: Number(workstreamCount?.count ?? 0),
      milestones: Number(milestoneCount?.count ?? 0),
      risks: Number(riskCount?.count ?? 0),
      issues: Number(issueCount?.count ?? 0),
      progressUpdates: Number(progressCount?.count ?? 0),
    },
    toCreate: {
      projects: projects.length - skippedProjects,
      epics: epicCount,
      stories: storyCount,
      riskIssues: riskIssueCount,
      blockerIssues: blockerCount,
    },
  };
}
