import { z } from 'zod';
import { router, protectedProcedure, requireRole } from '../trpc.js';
import { risks, issues, ventures, decisions, resources } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { RAG_RATING, RISK_STATUS, RISK_IMPACT, ISSUE_STATUS } from '../../shared/enums.js';
import { deriveRag } from '../../shared/enums.js';
import { logAudit, logAuditDiff } from '../services/audit.js';

async function assertVentureReadAccess(ctx: any, ventureId: string) {
  const [venture] = await ctx.db.select().from(ventures).where(eq(ventures.id, ventureId)).limit(1);
  if (!venture) throw new TRPCError({ code: 'NOT_FOUND', message: 'Venture not found' });
  if (ctx.user.role === 'pm' && venture.pmUserId !== ctx.user.id) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this venture' });
  }
  return venture;
}

function getScoreBand(score: number): string {
  if (score <= 4) return 'green';
  if (score <= 8) return 'yellow';
  if (score <= 12) return 'amber';
  if (score <= 19) return 'red';
  return 'darkRed';
}

export const risksRouter = router({
  // ── Risks ──────────────────────────────────────

  listRisks: protectedProcedure
    .input(z.object({ ventureId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertVentureReadAccess(ctx, input.ventureId);
      const ventureRisks = await ctx.db.select().from(risks).where(eq(risks.ventureId, input.ventureId));

      // Resolve owner resource names
      const ownerIds = [...new Set(ventureRisks.map(r => r.ownerResourceId).filter((id): id is string => id != null))];
      let resourceMap = new Map<string, string>();
      if (ownerIds.length > 0) {
        const { inArray } = await import('drizzle-orm');
        const ownerResources = await ctx.db.select({ id: resources.id, name: resources.name }).from(resources).where(inArray(resources.id, ownerIds));
        resourceMap = new Map(ownerResources.map(r => [r.id, r.name]));
      }

      return ventureRisks.map(r => ({
        ...r,
        ownerName: r.ownerResourceId ? resourceMap.get(r.ownerResourceId) ?? null : null,
      }));
    }),

  createRisk: protectedProcedure
    .input(z.object({
      ventureId: z.string().uuid(),
      title: z.string().min(1).max(255),
      description: z.string().max(5000).optional(),
      likelihood: z.number().int().min(1).max(5),
      impact: z.number().int().min(1).max(5),
      weight: z.number().int().min(1).max(5).default(3),
      rag: z.enum(RAG_RATING).optional(),
      mitigationPlan: z.string().max(5000).optional(),
      ownerResourceId: z.string().uuid().nullable().optional(),
      escalationPath: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertVentureReadAccess(ctx, input.ventureId);
      if (ctx.user.role === 'gm') throw new TRPCError({ code: 'FORBIDDEN' });

      const riskScore = input.likelihood * input.impact;
      const rag = input.rag ?? deriveRag(input.likelihood, input.impact);
      const ragOverride = !!input.rag;

      const [risk] = await ctx.db.insert(risks).values({
        ventureId: input.ventureId,
        title: input.title,
        description: input.description,
        likelihood: input.likelihood,
        impact: input.impact,
        riskScore,
        weight: input.weight,
        rag,
        ragOverride,
        mitigationPlan: input.mitigationPlan,
        ownerResourceId: input.ownerResourceId ?? null,
        escalationPath: input.escalationPath,
        createdBy: ctx.user.id,
      }).returning();

      await logAudit(ctx.db, {
        entityType: 'risk', entityId: risk.id, ventureId: input.ventureId,
        action: 'created', changedBy: ctx.user.id,
      });

      return risk;
    }),

  updateRisk: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      title: z.string().min(1).max(255).optional(),
      description: z.string().max(5000).optional(),
      likelihood: z.number().int().min(1).max(5).optional(),
      impact: z.number().int().min(1).max(5).optional(),
      weight: z.number().int().min(1).max(5).optional(),
      rag: z.enum(RAG_RATING).optional(),
      ragOverride: z.boolean().optional(),
      mitigationPlan: z.string().max(5000).optional(),
      ownerResourceId: z.string().uuid().nullable().optional(),
      escalationPath: z.string().max(2000).optional(),
      status: z.enum(RISK_STATUS).optional(),
      escalated: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const [risk] = await ctx.db.select().from(risks).where(eq(risks.id, id)).limit(1);
      if (!risk) throw new TRPCError({ code: 'NOT_FOUND' });
      await assertVentureReadAccess(ctx, risk.ventureId);
      if (ctx.user.role === 'gm') throw new TRPCError({ code: 'FORBIDDEN' });

      // HIGH-06 fix: require rag value when enabling override
      if (updates.ragOverride === true && !updates.rag) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'RAG value required when enabling override' });
      }

      // Determine effective likelihood and impact
      const newLikelihood = updates.likelihood ?? risk.likelihood;
      const newImpact = updates.impact ?? risk.impact;
      const scoreChanged = updates.likelihood !== undefined || updates.impact !== undefined;

      // Compute risk score
      let riskScore = risk.riskScore;
      if (scoreChanged) {
        riskScore = newLikelihood * newImpact;
      }

      // Determine RAG and ragOverride
      let rag = risk.rag;
      let ragOverride = risk.ragOverride;

      if (updates.rag) {
        // Explicit RAG provided — override
        rag = updates.rag;
        ragOverride = true;
      } else if (updates.ragOverride === false) {
        // Explicitly turning off override — auto-derive
        rag = deriveRag(newLikelihood, newImpact);
        ragOverride = false;
      } else if (scoreChanged && !risk.ragOverride) {
        // Score changed and no override — auto-derive
        rag = deriveRag(newLikelihood, newImpact);
        ragOverride = false;
      }

      // CRITICAL-03 fix: only include explicitly provided fields, filter out undefined
      const cleanUpdates = Object.fromEntries(
        Object.entries(updates).filter(([_, v]) => v !== undefined)
      );
      const setValues: Record<string, any> = {
        ...cleanUpdates,
        riskScore,
        rag,
        ragOverride,
        updatedAt: new Date(),
      };

      const [updated] = await ctx.db.update(risks)
        .set(setValues)
        .where(eq(risks.id, id))
        .returning();

      if (updates.escalated === true && !risk.escalated) {
        await logAudit(ctx.db, {
          entityType: 'risk', entityId: id, ventureId: risk.ventureId,
          action: 'escalated', changedBy: ctx.user.id,
        });
      } else if (updates.status === 'closed' || updates.status === 'mitigated') {
        await logAudit(ctx.db, {
          entityType: 'risk', entityId: id, ventureId: risk.ventureId,
          action: 'resolved', fieldName: 'status',
          oldValue: risk.status, newValue: updates.status,
          changedBy: ctx.user.id,
        });
      } else {
        await logAuditDiff(ctx.db, {
          entityType: 'risk', entityId: id, ventureId: risk.ventureId, changedBy: ctx.user.id,
          before: risk, after: updates,
        });
      }

      return updated;
    }),

  heatmapData: protectedProcedure
    .input(z.object({ ventureId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertVentureReadAccess(ctx, input.ventureId);
      const ventureRisks = await ctx.db.select().from(risks).where(
        and(eq(risks.ventureId, input.ventureId), eq(risks.status, 'open'))
      );

      // Group by likelihood/impact
      const cellMap = new Map<string, { likelihood: number; impact: number; count: number; risks: { id: string; title: string; riskScore: number }[] }>();
      for (const r of ventureRisks) {
        const key = `${r.likelihood}-${r.impact}`;
        if (!cellMap.has(key)) {
          cellMap.set(key, { likelihood: r.likelihood, impact: r.impact, count: 0, risks: [] });
        }
        const cell = cellMap.get(key)!;
        cell.count++;
        cell.risks.push({ id: r.id, title: r.title, riskScore: r.riskScore });
      }

      return Array.from(cellMap.values());
    }),

  riskSummary: protectedProcedure
    .input(z.object({ ventureId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertVentureReadAccess(ctx, input.ventureId);
      const openRisks = await ctx.db.select().from(risks).where(
        and(eq(risks.ventureId, input.ventureId), eq(risks.status, 'open'))
      );

      const countByBand = { green: 0, yellow: 0, amber: 0, red: 0, darkRed: 0 };
      let highestScore = 0;
      let sumScoreWeight = 0;
      let sumWeight = 0;

      for (const r of openRisks) {
        const band = getScoreBand(r.riskScore);
        countByBand[band as keyof typeof countByBand]++;
        if (r.riskScore > highestScore) highestScore = r.riskScore;
        sumScoreWeight += r.riskScore * r.weight;
        sumWeight += r.weight;
      }

      const weightedExposure = sumWeight > 0 ? Math.round((sumScoreWeight / sumWeight) * 100) / 100 : 0;

      return {
        highestScore,
        weightedExposure,
        countByBand,
        totalOpen: openRisks.length,
      };
    }),

  // ── Issues ─────────────────────────────────────

  listIssues: protectedProcedure
    .input(z.object({ ventureId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertVentureReadAccess(ctx, input.ventureId);
      return ctx.db.select().from(issues).where(eq(issues.ventureId, input.ventureId));
    }),

  createIssue: protectedProcedure
    .input(z.object({
      ventureId: z.string().uuid(),
      title: z.string().min(1).max(255),
      description: z.string().optional(),
      severity: z.enum(RISK_IMPACT),
      impactDescription: z.string().optional(),
      resolutionPlan: z.string().optional(),
      owner: z.string().max(255).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertVentureReadAccess(ctx, input.ventureId);
      if (ctx.user.role === 'gm') throw new TRPCError({ code: 'FORBIDDEN' });

      const [issue] = await ctx.db.insert(issues).values({
        ...input,
        createdBy: ctx.user.id,
      }).returning();

      await logAudit(ctx.db, {
        entityType: 'issue', entityId: issue.id, ventureId: input.ventureId,
        action: 'created', changedBy: ctx.user.id,
      });

      return issue;
    }),

  updateIssue: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      status: z.enum(ISSUE_STATUS).optional(),
      resolutionPlan: z.string().optional(),
      owner: z.string().max(255).optional(),
      escalated: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const [issue] = await ctx.db.select().from(issues).where(eq(issues.id, id)).limit(1);
      if (!issue) throw new TRPCError({ code: 'NOT_FOUND' });
      await assertVentureReadAccess(ctx, issue.ventureId);
      if (ctx.user.role === 'gm') throw new TRPCError({ code: 'FORBIDDEN' });

      const [updated] = await ctx.db.update(issues)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(issues.id, id))
        .returning();

      if (updates.status === 'resolved') {
        await logAudit(ctx.db, {
          entityType: 'issue', entityId: id, ventureId: issue.ventureId,
          action: 'resolved', fieldName: 'status',
          oldValue: issue.status, newValue: 'resolved',
          changedBy: ctx.user.id,
        });
      } else {
        await logAuditDiff(ctx.db, {
          entityType: 'issue', entityId: id, ventureId: issue.ventureId, changedBy: ctx.user.id,
          before: issue, after: updates,
        });
      }

      return updated;
    }),

  // ── Cross-venture escalations (PMO dashboard) ──

  allEscalations: protectedProcedure
    .use(requireRole('gm', 'pmo'))
    .query(async ({ ctx }) => {
      const escalatedRisks = await ctx.db
        .select()
        .from(risks)
        .where(eq(risks.escalated, true));

      const escalatedIssues = await ctx.db
        .select()
        .from(issues)
        .where(eq(issues.escalated, true));

      return { risks: escalatedRisks, issues: escalatedIssues };
    }),

  // ── Cross-venture decisions (PMO dashboard) ────

  allOpenDecisions: protectedProcedure
    .use(requireRole('pmo'))
    .query(async ({ ctx }) => {
      return ctx.db
        .select()
        .from(decisions)
        .where(eq(decisions.status, 'open'));
    }),

  // ── Resolve decision ────────────────────────────

  resolveDecision: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role === 'gm') throw new TRPCError({ code: 'FORBIDDEN' });
      const [decision] = await ctx.db.select().from(decisions).where(eq(decisions.id, input.id)).limit(1);
      if (!decision) throw new TRPCError({ code: 'NOT_FOUND' });
      await assertVentureReadAccess(ctx, decision.ventureId);

      const [updated] = await ctx.db.update(decisions).set({
        status: 'resolved',
        resolvedAt: new Date(),
        resolvedBy: ctx.user.id,
      }).where(eq(decisions.id, input.id)).returning();

      await logAudit(ctx.db, {
        entityType: 'decision', entityId: input.id, ventureId: decision.ventureId,
        action: 'resolved', changedBy: ctx.user.id,
      });

      return updated;
    }),
});
