import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { milestones, workstreams, ventures } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { MILESTONE_STATUS } from '../../shared/enums.js';

function applyOverdueLogic(milestone: typeof milestones.$inferSelect): typeof milestones.$inferSelect {
  const today = new Date().toISOString().split('T')[0];
  if (milestone.dueDate < today && milestone.status !== 'achieved' && milestone.status !== 'deferred') {
    return { ...milestone, status: 'overdue' };
  }
  return milestone;
}

export const milestonesRouter = router({
  list: protectedProcedure
    .input(z.object({ workstreamId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [ws] = await ctx.db.select().from(workstreams).where(eq(workstreams.id, input.workstreamId)).limit(1);
      if (!ws) throw new TRPCError({ code: 'NOT_FOUND', message: 'Workstream not found' });

      const [venture] = await ctx.db.select().from(ventures).where(eq(ventures.id, ws.ventureId)).limit(1);
      if (ctx.user.role === 'pm' && venture && venture.pmUserId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this venture' });
      }

      const rows = await ctx.db.select().from(milestones).where(eq(milestones.workstreamId, input.workstreamId));
      return rows.map(applyOverdueLogic);
    }),

  listForVenture: protectedProcedure
    .input(z.object({ ventureId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [venture] = await ctx.db.select().from(ventures).where(eq(ventures.id, input.ventureId)).limit(1);
      if (!venture) throw new TRPCError({ code: 'NOT_FOUND', message: 'Venture not found' });
      if (ctx.user.role === 'pm' && venture.pmUserId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this venture' });
      }

      const ventureWorkstreams = await ctx.db.select().from(workstreams).where(eq(workstreams.ventureId, input.ventureId));
      const wsIds = ventureWorkstreams.map(w => w.id);
      if (wsIds.length === 0) return [];

      const allMilestones = await ctx.db.select().from(milestones);
      return allMilestones
        .filter(m => wsIds.includes(m.workstreamId))
        .map(applyOverdueLogic);
    }),

  create: protectedProcedure
    .input(z.object({
      workstreamId: z.string().uuid(),
      name: z.string().min(1).max(255),
      dueDate: z.string(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [ws] = await ctx.db.select().from(workstreams).where(eq(workstreams.id, input.workstreamId)).limit(1);
      if (!ws) throw new TRPCError({ code: 'NOT_FOUND', message: 'Workstream not found' });

      const [venture] = await ctx.db.select().from(ventures).where(eq(ventures.id, ws.ventureId)).limit(1);
      if (ctx.user.role === 'pm' && venture && venture.pmUserId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      if (ctx.user.role === 'gm') throw new TRPCError({ code: 'FORBIDDEN' });

      const [ms] = await ctx.db.insert(milestones).values({ ...input, status: 'upcoming' }).returning();
      return ms;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(255).optional(),
      dueDate: z.string().optional(),
      actualCompletionDate: z.string().nullable().optional(),
      status: z.enum(MILESTONE_STATUS).optional(),
      notes: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const [ms] = await ctx.db.select().from(milestones).where(eq(milestones.id, id)).limit(1);
      if (!ms) throw new TRPCError({ code: 'NOT_FOUND', message: 'Milestone not found' });

      const [ws] = await ctx.db.select().from(workstreams).where(eq(workstreams.id, ms.workstreamId)).limit(1);
      if (!ws) throw new TRPCError({ code: 'NOT_FOUND' });
      const [venture] = await ctx.db.select().from(ventures).where(eq(ventures.id, ws.ventureId)).limit(1);
      if (ctx.user.role === 'pm' && venture && venture.pmUserId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      if (ctx.user.role === 'gm') throw new TRPCError({ code: 'FORBIDDEN' });

      const [updated] = await ctx.db.update(milestones)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(milestones.id, id))
        .returning();
      return updated;
    }),
});
