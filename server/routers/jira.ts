/**
 * tRPC router: jira
 * Handles Jira connection management, import, and sync dashboard procedures.
 *
 * All procedures require authentication.
 * PMO-only procedures additionally use requireRole('pmo').
 * PM procedures are scoped to the PM's own ventures.
 */

import { z } from 'zod';
import { router, protectedProcedure, requireRole } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { eq, and, desc, count, gte } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import {
  jiraConnections,
  jiraSyncMappings,
  jiraSyncLog,
  jiraStatusMappings,
  ventures,
  users,
} from '../db/schema.js';
import { encryptToken, decryptToken } from '../services/encryption.js';
import * as jiraClient from '../services/jiraClient.js';
import { triggerImport, getImportStatus, getImportPreview } from '../services/jiraImport.js';
import { reconcileConnection } from '../services/jiraReconciliation.js';

// ── Input validators ────────────────────────────────────────────

const instanceUrlSchema = z
  .string()
  .url('Instance URL must be a valid URL')
  .max(500, 'Instance URL must be at most 500 characters')
  .refine(
    (url) => /^https:\/\/[a-zA-Z0-9-]+\.atlassian\.net(\/.*)?$/.test(url),
    { message: 'Instance URL must match *.atlassian.net' }
  );

const emailSchema = z
  .string()
  .email('Must be a valid email address')
  .max(255, 'Email must be at most 255 characters');

const apiTokenSchema = z
  .string()
  .min(1, 'API token is required')
  .max(500, 'API token must be at most 500 characters')
  .refine((s) => s.trim().length > 0, { message: 'API token must not be whitespace-only' });

// ── Helper ─────────────────────────────────────────────────────

async function getActiveConnection(db: any) {
  const [conn] = await db
    .select()
    .from(jiraConnections)
    .orderBy(desc(jiraConnections.createdAt))
    .limit(1);
  return conn ?? null;
}

function stripSensitiveFields(conn: any) {
  const { apiTokenEncrypted, webhookSecret, ...safe } = conn;
  return safe;
}

// ── Router ─────────────────────────────────────────────────────

export const jiraRouter = router({

  // ── jira.getConnection ───────────────────────────────────────
  // Returns current connection metadata. Never returns the token or secret.
  getConnection: protectedProcedure
    .use(requireRole('pmo'))
    .query(async ({ ctx }) => {
      const conn = await getActiveConnection(ctx.db);
      if (!conn) return null;
      return stripSensitiveFields(conn);
    }),

  // ── jira.testConnection ──────────────────────────────────────
  // Tests credentials without saving. Returns Jira account name on success.
  testConnection: protectedProcedure
    .use(requireRole('pmo'))
    .input(z.object({
      instanceUrl: instanceUrlSchema,
      email: emailSchema,
      apiToken: apiTokenSchema,
    }))
    .mutation(async ({ input }) => {
      const result = await jiraClient.testConnection(
        input.instanceUrl,
        input.email,
        input.apiToken,
      );
      return result; // { success, accountName?, error? }
    }),

  // ── jira.saveConnection ──────────────────────────────────────
  // Validates credentials, encrypts the token, registers the Jira webhook, saves.
  saveConnection: protectedProcedure
    .use(requireRole('pmo'))
    .input(z.object({
      instanceUrl: instanceUrlSchema,
      email: emailSchema,
      apiToken: apiTokenSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      // Test first
      const testResult = await jiraClient.testConnection(
        input.instanceUrl,
        input.email,
        input.apiToken,
      );
      if (!testResult.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Jira connection test failed: ${testResult.error}`,
        });
      }

      // Generate HMAC secret for incoming webhooks.
      // Fix #5: Store it encrypted (same AES-256-GCM pattern as the API token)
      // so that a DB read does not expose the raw signing secret.
      const webhookSecretPlain = randomBytes(32).toString('hex');
      const webhookSecret = encryptToken(webhookSecretPlain);

      // Register webhook in Jira
      const webhookCallbackUrl = `${process.env.PUBLIC_URL ?? 'https://orbit.adres.ae'}/api/jira-webhook`;
      let webhookId: string | undefined;
      try {
        // Pass the plaintext secret to Jira (it needs this to sign payloads).
        // We store only the encrypted form in the DB (webhookSecret variable above).
        webhookId = await jiraClient.registerWebhook(
          input.instanceUrl,
          input.email,
          input.apiToken,
          webhookCallbackUrl,
          webhookSecretPlain,
        );
      } catch (webhookErr) {
        // Webhook registration failure is logged but does not block save.
        // Reconciliation job will still work.
        console.error('[jira.saveConnection] Webhook registration failed:', (webhookErr as Error).message);
      }

      // Encrypt token
      const apiTokenEncrypted = encryptToken(input.apiToken);

      // Upsert connection (one connection per ORBIT instance)
      const existing = await getActiveConnection(ctx.db);

      let connectionId: string;
      if (existing) {
        await ctx.db
          .update(jiraConnections)
          .set({
            instanceUrl: input.instanceUrl,
            accountEmail: input.email,
            apiTokenEncrypted,
            webhookSecret,
            webhookId: webhookId ?? existing.webhookId,
            status: 'connected',
            lastValidatedAt: new Date(),
            lastError: null,
            updatedAt: new Date(),
          })
          .where(eq(jiraConnections.id, existing.id));
        connectionId = existing.id;
      } else {
        const [newConn] = await ctx.db
          .insert(jiraConnections)
          .values({
            instanceUrl: input.instanceUrl,
            accountEmail: input.email,
            apiTokenEncrypted,
            webhookSecret,
            webhookId: webhookId ?? null,
            status: 'connected',
            lastValidatedAt: new Date(),
            createdBy: ctx.user.id,
          })
          .returning({ id: jiraConnections.id });
        connectionId = newConn.id;
      }

      return { connectionId };
    }),

  // ── jira.disconnect ──────────────────────────────────────────
  // Deregisters the webhook from Jira, marks connection inactive.
  // Does NOT delete venture data.
  disconnect: protectedProcedure
    .use(requireRole('pmo'))
    .mutation(async ({ ctx }) => {
      const conn = await getActiveConnection(ctx.db);
      if (!conn) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No active Jira connection found.' });
      }

      // Deregister webhook from Jira (best-effort)
      if (conn.webhookId) {
        try {
          const { decryptToken } = await import('../services/encryption.js');
          const token = decryptToken(conn.apiTokenEncrypted);
          await jiraClient.deregisterWebhook(conn.instanceUrl, conn.accountEmail, token, conn.webhookId);
        } catch (err) {
          console.warn('[jira.disconnect] Webhook deregistration failed (proceeding):', (err as Error).message);
        }
      }

      // Clear credentials, mark disconnected.
      // Fix #5: Store empty strings for both encrypted fields so that any
      // attempt to decrypt them fails (malformed ciphertext), preventing the
      // empty-key HMAC attack. The webhook handler's try/catch on decryptToken
      // will return 503 — correct behaviour for a disconnected integration.
      await ctx.db
        .update(jiraConnections)
        .set({
          status: 'disconnected',
          apiTokenEncrypted: '',
          webhookSecret: '',
          webhookId: null,
          updatedAt: new Date(),
        })
        .where(eq(jiraConnections.id, conn.id));

      return { success: true };
    }),

  // ── jira.getImportPreview ────────────────────────────────────
  // Read-only. Returns counts of data to be deleted and created.
  getImportPreview: protectedProcedure
    .use(requireRole('pmo'))
    .query(async ({ ctx }) => {
      const conn = await getActiveConnection(ctx.db);
      if (!conn) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No active Jira connection found.' });
      }
      if (conn.status !== 'connected') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Jira connection is in '${conn.status}' state. Reconnect before running import.`,
        });
      }

      return getImportPreview(conn.id);
    }),

  // ── jira.triggerImport ───────────────────────────────────────
  // Starts the async import. Returns a jobId for status polling.
  triggerImport: protectedProcedure
    .use(requireRole('pmo'))
    .mutation(async ({ ctx }) => {
      const conn = await getActiveConnection(ctx.db);
      if (!conn) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No active Jira connection found.' });
      }
      if (conn.importLock) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'An import is already in progress. Poll getImportStatus for updates.',
        });
      }

      const jobId = triggerImport(conn.id);
      return { jobId, status: 'queued', estimatedSeconds: 30 };
    }),

  // ── jira.getImportStatus ─────────────────────────────────────
  // Polls import job status by jobId.
  getImportStatus: protectedProcedure
    .use(requireRole('pmo'))
    .input(z.object({ jobId: z.string().max(100) }))
    .query(({ input }) => {
      const status = getImportStatus(input.jobId);
      if (!status) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Import job '${input.jobId}' not found. Job IDs are only available for the current server process.`,
        });
      }
      return status;
    }),

  // ── jira.retryImport ─────────────────────────────────────────
  // Same as triggerImport but with explicit retry semantics.
  retryImport: protectedProcedure
    .use(requireRole('pmo'))
    .mutation(async ({ ctx }) => {
      const conn = await getActiveConnection(ctx.db);
      if (!conn) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No active Jira connection found.' });
      }

      // Release any stale lock before retrying
      if (conn.importLock) {
        await ctx.db
          .update(jiraConnections)
          .set({ importLock: false, updatedAt: new Date() })
          .where(eq(jiraConnections.id, conn.id));
      }

      const jobId = triggerImport(conn.id);
      return { jobId, status: 'queued', estimatedSeconds: 30 };
    }),

  // ── jira.getSyncDashboard ────────────────────────────────────
  // Per-venture sync health (RAG, last sync, error count).
  getSyncDashboard: protectedProcedure
    .use(requireRole('pmo'))
    .query(async ({ ctx }) => {
      const conn = await getActiveConnection(ctx.db);
      if (!conn) return [];

      const jiraVentures = await ctx.db
        .select({
          id: ventures.id,
          name: ventures.name,
          jiraProjectKey: ventures.jiraProjectKey,
          jiraSyncEnabled: ventures.jiraSyncEnabled,
        })
        .from(ventures)
        .where(eq(ventures.jiraConnectionId, conn.id));

      const now = Date.now();

      const results = await Promise.all(
        jiraVentures.map(async (venture) => {
          // Get last successful sync
          const [lastSuccess] = await ctx.db
            .select({ createdAt: jiraSyncLog.createdAt })
            .from(jiraSyncLog)
            .where(
              and(
                eq(jiraSyncLog.connectionId, conn.id),
                eq(jiraSyncLog.ventureId, venture.id),
                eq(jiraSyncLog.level, 'info'),
              )
            )
            .orderBy(desc(jiraSyncLog.createdAt))
            .limit(1);

          const [errorCount] = await ctx.db
            .select({ count: count() })
            .from(jiraSyncLog)
            .where(
              and(
                eq(jiraSyncLog.connectionId, conn.id),
                eq(jiraSyncLog.ventureId, venture.id),
                eq(jiraSyncLog.level, 'error'),
              )
            );

          const lastSyncAt = lastSuccess?.createdAt ?? null;
          const lastSyncMs = lastSyncAt?.getTime() ?? 0;
          const errors = Number(errorCount?.count ?? 0);

          // Fix #15: Treat ventures that have never synced as a neutral "pending"
          // state rather than red. A never-synced venture is expected immediately
          // after import and should not alarm PMO admins with a red indicator.
          let rag: 'green' | 'amber' | 'red';
          let neverSynced = false;
          if (lastSyncMs === 0) {
            neverSynced = true;
            rag = 'amber'; // Neutral pending — not yet synced
          } else {
            const minutesSinceSync = (now - lastSyncMs) / 60_000;
            if (errors > 0 && minutesSinceSync > 120) {
              rag = 'red';
            } else if (minutesSinceSync > 120) {
              rag = 'red';
            } else if (minutesSinceSync > 30) {
              rag = 'amber';
            } else {
              rag = 'green';
            }
          }

          return {
            ventureId: venture.id,
            ventureName: venture.name,
            jiraProjectKey: venture.jiraProjectKey,
            jiraSyncEnabled: venture.jiraSyncEnabled,
            lastSyncAt,
            errorCount: errors,
            rag,
            neverSynced,
          };
        })
      );

      return results;
    }),

  // ── jira.getVentureSyncDetail ────────────────────────────────
  // Detailed sync log for a single venture. PMO: any venture. PM: own venture only.
  // Fix #7: enforce role via middleware — GMs are excluded, not given a partial view.
  getVentureSyncDetail: protectedProcedure
    .use(requireRole('pmo', 'pm'))
    .input(z.object({
      ventureId: z.string().uuid(),
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const [venture] = await ctx.db
        .select()
        .from(ventures)
        .where(eq(ventures.id, input.ventureId))
        .limit(1);

      if (!venture) throw new TRPCError({ code: 'NOT_FOUND', message: 'Venture not found.' });
      // PMs may only view their own ventures
      if (ctx.user.role === 'pm' && venture.pmUserId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this venture.' });
      }

      if (!venture.jiraConnectionId) {
        return {
          ventureId: venture.id,
          jiraProjectKey: null,
          jiraSyncEnabled: false,
          lastSyncAt: null,
          syncLog: [],
          total: 0,
        };
      }

      const offset = (input.page - 1) * input.limit;

      const [logEntries, totalCount] = await Promise.all([
        ctx.db
          .select()
          .from(jiraSyncLog)
          .where(
            and(
              eq(jiraSyncLog.connectionId, venture.jiraConnectionId),
              eq(jiraSyncLog.ventureId, venture.id),
            )
          )
          .orderBy(desc(jiraSyncLog.createdAt))
          .limit(input.limit)
          .offset(offset),
        ctx.db
          .select({ count: count() })
          .from(jiraSyncLog)
          .where(
            and(
              eq(jiraSyncLog.connectionId, venture.jiraConnectionId),
              eq(jiraSyncLog.ventureId, venture.id),
            )
          ),
      ]);

      const [lastSuccess] = await ctx.db
        .select({ createdAt: jiraSyncLog.createdAt })
        .from(jiraSyncLog)
        .where(
          and(
            eq(jiraSyncLog.connectionId, venture.jiraConnectionId),
            eq(jiraSyncLog.ventureId, venture.id),
            eq(jiraSyncLog.level, 'info'),
          )
        )
        .orderBy(desc(jiraSyncLog.createdAt))
        .limit(1);

      return {
        ventureId: venture.id,
        jiraProjectKey: venture.jiraProjectKey,
        jiraSyncEnabled: venture.jiraSyncEnabled,
        lastSyncAt: lastSuccess?.createdAt ?? null,
        syncLog: logEntries,
        total: Number(totalCount[0]?.count ?? 0),
        page: input.page,
        limit: input.limit,
      };
    }),

  // ── jira.triggerVentureResync ────────────────────────────────
  // Immediately reconciles a single venture. PMO only.
  triggerVentureResync: protectedProcedure
    .use(requireRole('pmo'))
    .input(z.object({ ventureId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [venture] = await ctx.db
        .select()
        .from(ventures)
        .where(eq(ventures.id, input.ventureId))
        .limit(1);

      if (!venture) throw new TRPCError({ code: 'NOT_FOUND', message: 'Venture not found.' });
      if (!venture.jiraConnectionId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This venture is not linked to a Jira connection.',
        });
      }

      // Run async, non-blocking
      reconcileConnection(venture.jiraConnectionId, venture.id).catch((err) => {
        console.error(`[jira.triggerVentureResync] Error for venture ${input.ventureId}:`, err);
      });

      return { started: true };
    }),

  // ── jira.setSyncEnabled ──────────────────────────────────────
  // Toggle jira_sync_enabled per venture. PMO: any; PM: own venture only.
  // Fix #8: enforce role via middleware — GMs are blocked at the middleware layer.
  setSyncEnabled: protectedProcedure
    .use(requireRole('pmo', 'pm'))
    .input(z.object({
      ventureId: z.string().uuid(),
      enabled: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [venture] = await ctx.db
        .select()
        .from(ventures)
        .where(eq(ventures.id, input.ventureId))
        .limit(1);

      if (!venture) throw new TRPCError({ code: 'NOT_FOUND', message: 'Venture not found.' });
      // PMs may only toggle sync for their own ventures
      if (ctx.user.role === 'pm' && venture.pmUserId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You can only toggle sync for your own ventures.' });
      }
      if (!venture.jiraConnectionId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This venture is not linked to a Jira connection.',
        });
      }

      await ctx.db
        .update(ventures)
        .set({ jiraSyncEnabled: input.enabled, updatedAt: new Date() })
        .where(eq(ventures.id, input.ventureId));

      return { ventureId: input.ventureId, jiraSyncEnabled: input.enabled };
    }),

  // ── jira.getStatusMappings ───────────────────────────────────
  // Returns all configured Jira→ORBIT status mappings for the current connection.
  getStatusMappings: protectedProcedure
    .use(requireRole('pmo'))
    .query(async ({ ctx }) => {
      const conn = await getActiveConnection(ctx.db);
      if (!conn) return [];

      return ctx.db
        .select()
        .from(jiraStatusMappings)
        .where(eq(jiraStatusMappings.connectionId, conn.id))
        .orderBy(jiraStatusMappings.jiraStatusName);
    }),

  // ── jira.updateStatusMapping ─────────────────────────────────
  // Upserts a Jira→ORBIT status mapping. Changes apply from next reconciliation.
  updateStatusMapping: protectedProcedure
    .use(requireRole('pmo'))
    .input(z.object({
      jiraStatusName: z.string().min(1).max(255),
      orbitStatus: z.enum(['not_started', 'in_progress', 'complete', 'on_hold']),
    }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getActiveConnection(ctx.db);
      if (!conn) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No active Jira connection found.' });
      }

      await ctx.db
        .insert(jiraStatusMappings)
        .values({
          connectionId: conn.id,
          jiraStatusName: input.jiraStatusName,
          orbitStatus: input.orbitStatus,
          updatedBy: ctx.user.id,
        })
        .onConflictDoUpdate({
          target: [jiraStatusMappings.connectionId, jiraStatusMappings.jiraStatusName],
          set: {
            orbitStatus: input.orbitStatus,
            updatedBy: ctx.user.id,
            updatedAt: new Date(),
          },
        });

      return { updated: true };
    }),

  // ── jira.getProjects ─────────────────────────────────────────
  // Lists all Jira projects available for the current connection.
  getProjects: protectedProcedure
    .use(requireRole('pmo'))
    .query(async ({ ctx }) => {
      const conn = await getActiveConnection(ctx.db);
      if (!conn || conn.status !== 'connected') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'No connected Jira instance. Configure the connection first.',
        });
      }

      const { decryptToken } = await import('../services/encryption.js');
      const token = decryptToken(conn.apiTokenEncrypted);
      return jiraClient.getProjects(conn.instanceUrl, conn.accountEmail, token);
    }),

  // ── jira.getLog ──────────────────────────────────────────────
  // Paginated sync log with optional filters.
  getLog: protectedProcedure
    .use(requireRole('pmo'))
    .input(z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(20),
      level: z.enum(['info', 'warning', 'error']).optional(),
      ventureId: z.string().uuid().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const conn = await getActiveConnection(ctx.db);
      if (!conn) return { data: [], total: 0, page: input.page, limit: input.limit };

      const offset = (input.page - 1) * input.limit;
      const conditions: any[] = [eq(jiraSyncLog.connectionId, conn.id)];
      if (input.level) conditions.push(eq(jiraSyncLog.level, input.level));
      if (input.ventureId) conditions.push(eq(jiraSyncLog.ventureId, input.ventureId));

      const [entries, totalRows] = await Promise.all([
        ctx.db
          .select()
          .from(jiraSyncLog)
          .where(and(...conditions))
          .orderBy(desc(jiraSyncLog.createdAt))
          .limit(input.limit)
          .offset(offset),
        ctx.db
          .select({ count: count() })
          .from(jiraSyncLog)
          .where(and(...conditions)),
      ]);

      return {
        data: entries,
        total: Number(totalRows[0]?.count ?? 0),
        page: input.page,
        limit: input.limit,
      };
    }),

  // ── jira.debugProject ──────────────────────────────────────────
  // Fetches raw epic data for a single project to inspect available fields.
  // Temporary debug endpoint for verifying field mappings.
  debugProject: protectedProcedure
    .use(requireRole('pmo'))
    .input(z.object({ projectKey: z.string().max(20) }))
    .query(async ({ ctx, input }) => {
      const conn = await getActiveConnection(ctx.db);
      if (!conn) throw new TRPCError({ code: 'NOT_FOUND', message: 'No active Jira connection.' });
      const apiToken = decryptToken(conn.apiTokenEncrypted);
      const base = conn.instanceUrl.replace(/\/$/, '');
      const url = `${base}/rest/api/3/search/jql`;

      // Fetch first 5 epics with ALL fields to see what's available
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${conn.accountEmail}:${apiToken}`).toString('base64'),
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          jql: `project="${input.projectKey}" AND issuetype=Epic ORDER BY created ASC`,
          maxResults: 5,
          fields: ['summary', 'status', 'created', 'duedate', 'aggregateprogress', 'resolutiondate', 'updated', 'statuscategorychangedate'],
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Jira HTTP ${response.status}: ${text}` });
      }

      const body = await response.json() as { issues: any[]; total: number };
      return {
        total: body.total,
        epics: body.issues.map((e: any) => ({
          key: e.key,
          summary: e.fields?.summary,
          status: e.fields?.status?.name,
          created: e.fields?.created,
          duedate: e.fields?.duedate,
          resolutiondate: e.fields?.resolutiondate,
          updated: e.fields?.updated,
          aggregateprogress: e.fields?.aggregateprogress,
          statuscategorychangedate: e.fields?.statuscategorychangedate,
        })),
      };
    }),
});
