import { z } from 'zod';
import { router, protectedProcedure, requireRole } from '../trpc.js';
import {
  progressUpdates,
  workstreamUpdates,
  milestoneCompletions,
  issues,
  decisions,
  ventures,
  workstreams,
  milestones,
} from '../db/schema.js';
import { eq, desc, and, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { HEALTH_STATUS, WORKSTREAM_STATUS } from '../../shared/enums.js';

export const progressRouter = router({
  submit: protectedProcedure
    .use(requireRole('pm'))
    .input(z.object({
      ventureId: z.string().uuid(),
      weekLabel: z.string().max(20).optional(),
      overallStatus: z.enum(HEALTH_STATUS),
      completionPct: z.number().int().min(0).max(100),
      narrative: z.string().min(1),
      nextActions: z.string().optional(),
      workstreamUpdates: z.array(z.object({
        workstreamId: z.string().uuid(),
        status: z.enum(WORKSTREAM_STATUS),
        completionPct: z.number().int().min(0).max(100),
        notes: z.string().optional(),
      })).optional(),
      milestoneCompletions: z.array(z.object({
        milestoneId: z.string().uuid(),
        completedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format'),
      })).optional(),
      blockersList: z.array(z.object({
        description: z.string().min(1),
      })).optional(),
      decisionsList: z.array(z.object({
        description: z.string().min(1),
      })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify PM owns this venture
      const [venture] = await ctx.db.select().from(ventures).where(eq(ventures.id, input.ventureId)).limit(1);
      if (!venture) throw new TRPCError({ code: 'NOT_FOUND', message: 'Venture not found' });
      if (venture.pmUserId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this venture' });
      }

      // Verify workstreamIds belong to this venture
      if (input.workstreamUpdates?.length) {
        const wsIds = input.workstreamUpdates.map(wu => wu.workstreamId);
        const ventureWs = await ctx.db.select({ id: workstreams.id }).from(workstreams)
          .where(and(inArray(workstreams.id, wsIds), eq(workstreams.ventureId, input.ventureId)));
        const validWsIds = new Set(ventureWs.map(w => w.id));
        for (const wu of input.workstreamUpdates) {
          if (!validWsIds.has(wu.workstreamId)) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: `Workstream ${wu.workstreamId} does not belong to this venture` });
          }
        }
      }

      // Verify milestoneIds belong to workstreams in this venture
      if (input.milestoneCompletions?.length) {
        const msIds = input.milestoneCompletions.map(mc => mc.milestoneId);
        const ventureWs = await ctx.db.select({ id: workstreams.id }).from(workstreams)
          .where(eq(workstreams.ventureId, input.ventureId));
        const ventureWsIds = ventureWs.map(w => w.id);
        if (ventureWsIds.length === 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Venture has no workstreams' });
        }
        const ventureMilestones = await ctx.db.select({ id: milestones.id }).from(milestones)
          .where(inArray(milestones.workstreamId, ventureWsIds));
        const validMsIds = new Set(ventureMilestones.map(m => m.id));
        for (const mc of input.milestoneCompletions) {
          if (!validMsIds.has(mc.milestoneId)) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: `Milestone ${mc.milestoneId} does not belong to this venture` });
          }
        }
      }

      // Atomic transaction — all or nothing
      return await ctx.db.transaction(async (tx) => {
        // Create progress update
        const [update] = await tx.insert(progressUpdates).values({
          ventureId: input.ventureId,
          submittedBy: ctx.user.id,
          weekLabel: input.weekLabel,
          overallStatus: input.overallStatus,
          completionPct: input.completionPct,
          narrative: input.narrative,
          nextActions: input.nextActions,
        }).returning();

        // Create workstream updates
        if (input.workstreamUpdates?.length) {
          await tx.insert(workstreamUpdates).values(
            input.workstreamUpdates.map(wu => ({
              progressUpdateId: update.id,
              workstreamId: wu.workstreamId,
              status: wu.status,
              completionPct: wu.completionPct,
              notes: wu.notes,
            }))
          );

          for (const wu of input.workstreamUpdates) {
            await tx.update(workstreams)
              .set({ status: wu.status, completionPct: wu.completionPct, updatedAt: new Date() })
              .where(eq(workstreams.id, wu.workstreamId));
          }
        }

        // Record milestone completions
        if (input.milestoneCompletions?.length) {
          await tx.insert(milestoneCompletions).values(
            input.milestoneCompletions.map(mc => ({
              progressUpdateId: update.id,
              milestoneId: mc.milestoneId,
              completedAt: mc.completedAt,
            }))
          );

          for (const mc of input.milestoneCompletions) {
            await tx.update(milestones)
              .set({ status: 'achieved', actualCompletionDate: mc.completedAt, updatedAt: new Date() })
              .where(eq(milestones.id, mc.milestoneId));
          }
        }

        // Create blocker issues
        if (input.blockersList?.length) {
          await tx.insert(issues).values(
            input.blockersList.map(b => ({
              ventureId: input.ventureId,
              title: `Blocker: ${b.description.slice(0, 200)}`,
              description: b.description,
              severity: 'blocker' as const,
              status: 'open' as const,
              createdBy: ctx.user.id,
            }))
          );
        }

        // Create decisions
        if (input.decisionsList?.length) {
          await tx.insert(decisions).values(
            input.decisionsList.map(d => ({
              progressUpdateId: update.id,
              ventureId: input.ventureId,
              description: d.description,
              status: 'open' as const,
            }))
          );
        }

        // Update venture health, completion, and timestamp
        await tx.update(ventures).set({
          health: input.overallStatus,
          completionPct: input.completionPct,
          updatedAt: new Date(),
        }).where(eq(ventures.id, input.ventureId));

        return update;
      });
    }),

  list: protectedProcedure
    .input(z.object({ ventureId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [venture] = await ctx.db.select().from(ventures).where(eq(ventures.id, input.ventureId)).limit(1);
      if (!venture) throw new TRPCError({ code: 'NOT_FOUND', message: 'Venture not found' });
      if (ctx.user.role === 'pm' && venture.pmUserId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this venture' });
      }

      return ctx.db
        .select()
        .from(progressUpdates)
        .where(eq(progressUpdates.ventureId, input.ventureId))
        .orderBy(desc(progressUpdates.submittedAt));
    }),

  latest: protectedProcedure
    .input(z.object({ ventureId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [venture] = await ctx.db.select().from(ventures).where(eq(ventures.id, input.ventureId)).limit(1);
      if (!venture) throw new TRPCError({ code: 'NOT_FOUND', message: 'Venture not found' });
      if (ctx.user.role === 'pm' && venture.pmUserId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this venture' });
      }

      const [latest] = await ctx.db
        .select()
        .from(progressUpdates)
        .where(eq(progressUpdates.ventureId, input.ventureId))
        .orderBy(desc(progressUpdates.submittedAt))
        .limit(1);

      return latest ?? null;
    }),
});
