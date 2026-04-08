/**
 * Jira inbound webhook handler.
 *
 * IMPORTANT: This file exports registerJiraWebhookRoute(app) which MUST be called
 * in server/index.ts BEFORE app.use(express.json(...)) to preserve the raw body
 * for HMAC-SHA256 validation. The route uses express.raw({ type: 'application/json' })
 * with no size limit.
 *
 * Route: POST /api/jira-webhook
 * Auth: HMAC-SHA256 via X-Hub-Signature header (constant-time compare)
 * Rate: 500 req/min per IP (separate from global 200/min limiter)
 */

import type { Express, Request, Response } from 'express';
import express from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import rateLimit from 'express-rate-limit';
import { decryptToken } from '../services/encryption.js';
import { db } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import {
  jiraConnections,
  jiraSyncMappings,
  jiraSyncLog,
  jiraStatusMappings,
  ventures,
  progressUpdates,
  users,
} from '../db/schema.js';
import {
  softDeleteOrbitEntity,
  handleNewIssueFromWebhook,
  applyIssueUpdate,
} from '../services/jiraReconciliation.js';
import { computeSyncHash, mapCommentToProgressUpdate } from '../services/jiraMappers.js';
import type { JiraIssue, JiraComment } from '../services/jiraClient.js';

const SYNC_USER_OID = 'sync-system-001';

// ── Rate limiter for webhook endpoint ─────────────────────────

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED' },
});

// ── HMAC validation ────────────────────────────────────────────

function validateHmacSignature(rawBody: Buffer, signature: string, secret: string): boolean {
  // Fix #4: An empty secret must never be accepted — HMAC computed with an empty
  // key would accept any forged request that knows the algorithm. Fail fast.
  if (!secret || secret.length === 0) return false;
  if (!signature) return false;

  // Jira sends: sha256=<hex-digest>
  const prefix = 'sha256=';
  const receivedHex = signature.startsWith(prefix) ? signature.slice(prefix.length) : signature;

  const computed = createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  try {
    const a = Buffer.from(computed, 'hex');
    const b = Buffer.from(receivedHex, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ── DB helpers ─────────────────────────────────────────────────

async function getSyncUserId(): Promise<string> {
  const [syncUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.azureOid, SYNC_USER_OID))
    .limit(1);
  if (!syncUser) throw new Error('Sync system user not found.');
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

// ── Idempotency check (FR-026) ─────────────────────────────────

async function isDuplicateEvent(
  connectionId: string,
  webhookEvent: string,
  issueId: string,
  changelogId?: string,
): Promise<boolean> {
  const key = `${webhookEvent}:${issueId}:${changelogId ?? 'no-changelog'}`;
  const [existing] = await db
    .select({ id: jiraSyncLog.id })
    .from(jiraSyncLog)
    .where(
      and(
        eq(jiraSyncLog.connectionId, connectionId),
        eq(jiraSyncLog.eventType, webhookEvent),
        eq(jiraSyncLog.jiraEntityId, issueId),
        eq(jiraSyncLog.message, `idempotency:${key}`),
      )
    )
    .limit(1);
  return !!existing;
}

async function recordEventDeduplicationKey(
  connectionId: string,
  webhookEvent: string,
  issueId: string,
  changelogId?: string,
): Promise<void> {
  const key = `${webhookEvent}:${issueId}:${changelogId ?? 'no-changelog'}`;
  await db.insert(jiraSyncLog).values({
    connectionId,
    eventType: webhookEvent,
    level: 'info',
    message: `idempotency:${key}`,
    jiraEntityType: 'issue',
    jiraEntityId: issueId,
  }).catch(() => { /* ignore if it already exists */ });
}

// ── Webhook payload types ──────────────────────────────────────

interface JiraWebhookPayload {
  webhookEvent?: string;
  issue?: JiraIssue & {
    properties?: Array<{ key: string; value: any }>;
  };
  comment?: JiraComment;
  changelog?: { id?: string; items?: any[] };
  matchedWebhookIds?: number[];
}

// ── Event dispatchers ──────────────────────────────────────────

async function handleIssueCreated(
  payload: JiraWebhookPayload,
  connectionId: string,
  syncUserId: string,
): Promise<void> {
  const issue = payload.issue!;

  // Echo loop prevention: skip if this issue originated from ORBIT sync
  const hasOrbitSource = issue.properties?.some(
    (p) => p.key === 'orbit_sync_source'
  );
  if (hasOrbitSource) return;

  // Find venture by Jira project key
  const projectKey = (issue as any).fields?.project?.key;
  if (!projectKey) return;

  const [venture] = await db
    .select({ id: ventures.id, targetEndDate: ventures.targetEndDate })
    .from(ventures)
    .where(
      and(
        eq(ventures.jiraConnectionId, connectionId),
        eq(ventures.jiraProjectKey, projectKey),
        eq(ventures.jiraSyncEnabled, true),
      )
    )
    .limit(1);

  if (!venture) return; // Project not imported into ORBIT

  const customMappings = await getCustomMappings(connectionId);

  await handleNewIssueFromWebhook(
    issue, connectionId, venture.id, venture.targetEndDate, syncUserId, customMappings
  );

  await writeSyncLog({
    connectionId,
    ventureId: venture.id,
    eventType: 'jira:issue_created',
    level: 'info',
    message: `Created ORBIT entity from new Jira issue ${issue.key}`,
    jiraEntityType: 'issue',
    jiraEntityId: issue.id,
  });
}

async function handleIssueUpdated(
  payload: JiraWebhookPayload,
  connectionId: string,
  syncUserId: string,
): Promise<void> {
  const issue = payload.issue!;

  // Look up sync mapping
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
    // Out-of-order event — try to create the entity
    const projectKey = (issue as any).fields?.project?.key;
    if (!projectKey) return;

    const [venture] = await db
      .select({ id: ventures.id, targetEndDate: ventures.targetEndDate })
      .from(ventures)
      .where(
        and(
          eq(ventures.jiraConnectionId, connectionId),
          eq(ventures.jiraProjectKey, projectKey),
          eq(ventures.jiraSyncEnabled, true),
        )
      )
      .limit(1);

    if (!venture) return;

    const customMappings = await getCustomMappings(connectionId);
    await handleNewIssueFromWebhook(
      issue, connectionId, venture.id, venture.targetEndDate, syncUserId, customMappings
    );
    return;
  }

  const newHash = computeSyncHash(issue);
  if (mapping.syncHash === newHash) return; // No change

  const [venture] = await db
    .select({ targetEndDate: ventures.targetEndDate, jiraSyncEnabled: ventures.jiraSyncEnabled })
    .from(ventures)
    .where(eq(ventures.jiraConnectionId, connectionId))
    .limit(1);

  // Fix #16: Respect the per-venture sync toggle. If a PM has disabled sync,
  // Jira-originated updates must not be applied even if a mapping exists.
  if (!venture?.jiraSyncEnabled) {
    console.info(`[jiraWebhook] Skipping issue_updated for ${issue.key} — venture sync is disabled.`);
    return;
  }

  const customMappings = await getCustomMappings(connectionId);
  await applyIssueUpdate(issue, mapping, syncUserId, venture?.targetEndDate ?? '', customMappings);

  await db
    .update(jiraSyncMappings)
    .set({ syncHash: newHash, syncedAt: new Date() })
    .where(eq(jiraSyncMappings.id, mapping.id));

  await writeSyncLog({
    connectionId,
    eventType: 'jira:issue_updated',
    level: 'info',
    message: `Updated ORBIT ${mapping.orbitEntityType} ${mapping.orbitEntityId} from Jira issue ${issue.key}`,
    jiraEntityType: 'issue',
    jiraEntityId: issue.id,
    orbitEntityType: mapping.orbitEntityType,
    orbitEntityId: mapping.orbitEntityId,
  });
}

async function handleIssueDeleted(
  payload: JiraWebhookPayload,
  connectionId: string,
): Promise<void> {
  const issue = payload.issue!;

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

  if (!mapping) return; // Not tracked — nothing to soft-delete

  await softDeleteOrbitEntity(mapping.orbitEntityType, mapping.orbitEntityId);

  await writeSyncLog({
    connectionId,
    eventType: 'jira:issue_deleted',
    level: 'info',
    message: `Soft-deleted ORBIT ${mapping.orbitEntityType} ${mapping.orbitEntityId} (Jira issue ${issue.key} deleted)`,
    jiraEntityType: 'issue',
    jiraEntityId: issue.id,
    orbitEntityType: mapping.orbitEntityType,
    orbitEntityId: mapping.orbitEntityId,
  });
}

async function handleCommentCreated(
  payload: JiraWebhookPayload,
  connectionId: string,
  syncUserId: string,
): Promise<void> {
  const comment = payload.comment;
  const issue = payload.issue;
  if (!comment || !issue) return;

  // Only process comments on epics (which map to workstreams)
  const issuetype = issue.fields?.issuetype?.name?.toLowerCase();
  if (issuetype !== 'epic') return;

  // Find the venture for this epic
  const [epicMapping] = await db
    .select({ orbitEntityId: jiraSyncMappings.orbitEntityId })
    .from(jiraSyncMappings)
    .where(
      and(
        eq(jiraSyncMappings.connectionId, connectionId),
        eq(jiraSyncMappings.jiraEntityType, 'epic'),
        eq(jiraSyncMappings.jiraEntityId, issue.id),
      )
    )
    .limit(1);

  if (!epicMapping) return;

  // Get venture for this workstream
  const { eq: eqDrizzle } = await import('drizzle-orm');
  const { workstreams } = await import('../db/schema.js');
  const [ws] = await db
    .select({ ventureId: workstreams.ventureId, completionPct: workstreams.completionPct })
    .from(workstreams)
    .where(eq(workstreams.id, epicMapping.orbitEntityId))
    .limit(1);

  if (!ws) return;

  const puShape = mapCommentToProgressUpdate(comment, ws.ventureId, syncUserId, ws.completionPct);
  await db.insert(progressUpdates).values(puShape);

  await writeSyncLog({
    connectionId,
    ventureId: ws.ventureId,
    eventType: 'comment_created',
    level: 'info',
    message: `Created progress update from Jira comment on epic ${issue.key}`,
    jiraEntityType: 'comment',
    jiraEntityId: comment.id,
  });
}

// ── Route registration ─────────────────────────────────────────

/**
 * Registers the Jira webhook POST route on the Express app.
 * MUST be called BEFORE app.use(express.json(...)) in server/index.ts.
 */
export function registerJiraWebhookRoute(app: Express): void {
  app.post(
    '/api/jira-webhook',
    webhookLimiter,
    express.raw({ type: 'application/json', limit: '2mb' }), // Fix #6: 2 MB cap; Jira payloads are never legitimately larger
    async (req: Request, res: Response) => {
      // Always return 200 immediately — Jira will retry on non-200
      // Processing errors are logged, not surfaced as HTTP errors (except auth)

      // ── Validate signature ───────────────────────────────
      const signatureHeader = req.headers['x-hub-signature'] as string | undefined;
      if (!signatureHeader) {
        res.status(401).json({ success: false, error: 'Missing X-Hub-Signature header', code: 'SIGNATURE_MISSING' });
        return;
      }

      const rawBody = req.body as Buffer;
      if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
        res.status(400).json({ success: false, error: 'Empty or malformed request body', code: 'INVALID_BODY' });
        return;
      }

      // ── Find active connection ───────────────────────────
      const [conn] = await db
        .select({ id: jiraConnections.id, webhookSecret: jiraConnections.webhookSecret, status: jiraConnections.status })
        .from(jiraConnections)
        .where(eq(jiraConnections.status, 'connected'))
        .limit(1);

      if (!conn) {
        res.status(503).json({ success: false, error: 'No active Jira connection', code: 'NO_CONNECTION' });
        return;
      }

      // ── HMAC validation (constant-time) ──────────────────
      // Fix #5: The webhookSecret column stores the encrypted secret. Decrypt it
      // before use. If decryption fails (e.g. key rotation) treat as invalid.
      let webhookSecret: string;
      try {
        webhookSecret = decryptToken(conn.webhookSecret);
      } catch {
        res.status(503).json({ success: false, error: 'Webhook secret unavailable', code: 'SECRET_UNAVAILABLE' });
        return;
      }
      const valid = validateHmacSignature(rawBody, signatureHeader, webhookSecret);
      if (!valid) {
        res.status(401).json({ success: false, error: 'HMAC signature validation failed', code: 'INVALID_SIGNATURE' });
        return;
      }

      // Acknowledge immediately — Jira's timeout is short
      res.status(200).json({ success: true });

      // ── Async processing ─────────────────────────────────
      let payload: JiraWebhookPayload;
      try {
        payload = JSON.parse(rawBody.toString('utf8')) as JiraWebhookPayload;
      } catch {
        await writeSyncLog({
          connectionId: conn.id,
          eventType: 'webhook_error',
          level: 'error',
          message: 'Failed to parse webhook payload as JSON',
        }).catch(() => {});
        return;
      }

      const webhookEvent = payload.webhookEvent;
      const issueId = payload.issue?.id;
      const changelogId = payload.changelog?.id;

      if (!webhookEvent) {
        await writeSyncLog({
          connectionId: conn.id,
          eventType: 'webhook_error',
          level: 'warning',
          message: 'Webhook payload missing webhookEvent field — discarded.',
          payload: { preview: rawBody.toString('utf8').slice(0, 200) },
        }).catch(() => {});
        return;
      }

      // ── Idempotency check (FR-026) ───────────────────────
      if (issueId) {
        const isDupe = await isDuplicateEvent(conn.id, webhookEvent, issueId, changelogId).catch(() => false);
        if (isDupe) {
          // Duplicate — discard silently but acknowledge
          return;
        }
        await recordEventDeduplicationKey(conn.id, webhookEvent, issueId, changelogId).catch(() => {});
      }

      let syncUserId: string;
      try {
        syncUserId = await getSyncUserId();
      } catch (err) {
        await writeSyncLog({
          connectionId: conn.id,
          eventType: webhookEvent,
          level: 'error',
          message: `Cannot process webhook: ${(err as Error).message}`,
        }).catch(() => {});
        return;
      }

      // ── Dispatch to handler ──────────────────────────────
      try {
        switch (webhookEvent) {
          case 'jira:issue_created':
            await handleIssueCreated(payload, conn.id, syncUserId);
            break;
          case 'jira:issue_updated':
            await handleIssueUpdated(payload, conn.id, syncUserId);
            break;
          case 'jira:issue_deleted':
            await handleIssueDeleted(payload, conn.id);
            break;
          case 'comment_created':
            await handleCommentCreated(payload, conn.id, syncUserId);
            break;
          default:
            // Unrecognised event — log at info, discard
            await writeSyncLog({
              connectionId: conn.id,
              eventType: webhookEvent,
              level: 'info',
              message: `Unrecognised Jira webhook event type '${webhookEvent}' — acknowledged and discarded.`,
            });
        }
      } catch (err) {
        await writeSyncLog({
          connectionId: conn.id,
          eventType: webhookEvent,
          level: 'error',
          message: `Webhook processing error for event '${webhookEvent}': ${(err as Error).message}`,
          jiraEntityId: issueId,
          payload: { error: (err as Error).message },
        }).catch(() => {});
      }
    }
  );
}
