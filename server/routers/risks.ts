import { z } from 'zod';
import { router, protectedProcedure, requireRole } from '../trpc.js';
import { risks, issues, ventures, blockers, decisions } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { RISK_PROBABILITY, RISK_IMPACT, RAG_RATING, RISK_STATUS, ISSUE_STATUS } from '../../shared/enums.js';
import { deriveRag } from '../../shared/enums.js';

async function assertVentureReadAccess(ctx: any, ventureId: string) {
  const [venture] = await ctx.db.select().from(ventures).where(eq(ventures.id, ventureId)).limit(1);
  if (!venture) throw new TRPCError({ code: 'NOT_FOUND', message: 'Venture not found' });
  if (ctx.user.role === 'pm' && venture.pmUserId !== ctx.user.id) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this venture' });
  }
  return venture;
}

export const risksRouter = router({
  // ── Risks ──────────────────────────────────────

  listRisks: protectedProcedure
    .input(z.object({ ventureId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertVentureReadAccess(ctx, input.ventureId);
      return ctx.db.select().from(risks).where(eq(risks.ventureId, input.ventureId));
    }),

  createRisk: protectedProcedure
    .input(z.object({
      ventureId: z.string().uuid(),
      title: z.string().min(1).max(255),
      description: z.string().optional(),
      probability: z.enum(RISK_PROBABILITY),
      impact: z.enum(RISK_IMPACT),
      rag: z.enum(RAG_RATING).optional(),
      mitigationPlan: z.string().optional(),
      owner: z.string().max(255).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertVentureReadAccess(ctx, input.ventureId);
      if (ctx.user.role === 'gm') throw new TRPCError({ code: 'FORBIDDEN' });

      const rag = input.rag ?? deriveRag(input.probability, input.impact);
      const [risk] = await ctx.db.insert(risks).values({
        ...input,
        rag,
        ragOverride: !!input.rag,
        createdBy: ctx.user.id,
      }).returning();
      return risk;
    }),

  updateRisk: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      status: z.enum(RISK_STATUS).optional(),
      probability: z.enum(RISK_PROBABILITY).optional(),
      impact: z.enum(RISK_IMPACT).optional(),
      rag: z.enum(RAG_RATING).optional(),
      mitigationPlan: z.string().optional(),
      owner: z.string().max(255).optional(),
      escalated: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const [risk] = await ctx.db.select().from(risks).where(eq(risks.id, id)).limit(1);
      if (!risk) throw new TRPCError({ code: 'NOT_FOUND' });
      await assertVentureReadAccess(ctx, risk.ventureId);
      if (ctx.user.role === 'gm') throw new TRPCError({ code: 'FORBIDDEN' });

      // Recalculate RAG if probability or impact changed
      let rag = updates.rag;
      let ragOverride = risk.ragOverride;
      if ((updates.probability || updates.impact) && !updates.rag) {
        rag = deriveRag(updates.probability ?? risk.probability, updates.impact ?? risk.impact);
        ragOverride = false;
      } else if (updates.rag) {
        ragOverride = true;
      }

      const [updated] = await ctx.db.update(risks)
        .set({ ...updates, rag, ragOverride, updatedAt: new Date() })
        .where(eq(risks.id, id))
        .returning();
      return updated;
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

  // ── Per-venture blockers ────────────────────────

  listBlockers: protectedProcedure
    .input(z.object({ ventureId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertVentureReadAccess(ctx, input.ventureId);
      return ctx.db.select().from(blockers).where(eq(blockers.ventureId, input.ventureId));
    }),

  // ── Cross-venture blockers ─────────────────────

  allOpenBlockers: protectedProcedure
    .use(requireRole('pmo'))
    .query(async ({ ctx }) => {
      return ctx.db
        .select()
        .from(blockers)
        .where(eq(blockers.status, 'open'));
    }),

  // ── Resolve blocker / decision ─────────────────

  resolveBlocker: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [blocker] = await ctx.db.select().from(blockers).where(eq(blockers.id, input.id)).limit(1);
      if (!blocker) throw new TRPCError({ code: 'NOT_FOUND' });
      await assertVentureReadAccess(ctx, blocker.ventureId);

      const [updated] = await ctx.db.update(blockers).set({
        status: 'resolved',
        resolvedAt: new Date(),
        resolvedBy: ctx.user.id,
      }).where(eq(blockers.id, input.id)).returning();
      return updated;
    }),

  resolveDecision: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [decision] = await ctx.db.select().from(decisions).where(eq(decisions.id, input.id)).limit(1);
      if (!decision) throw new TRPCError({ code: 'NOT_FOUND' });
      await assertVentureReadAccess(ctx, decision.ventureId);

      const [updated] = await ctx.db.update(decisions).set({
        status: 'resolved',
        resolvedAt: new Date(),
        resolvedBy: ctx.user.id,
      }).where(eq(decisions.id, input.id)).returning();
      return updated;
    }),
});
