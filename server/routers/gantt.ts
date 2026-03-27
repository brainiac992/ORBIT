import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { ventures, workstreams, milestones, taskDependencies } from '../db/schema.js';
import { eq, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

export const ganttRouter = router({
  data: protectedProcedure
    .input(z.object({ ventureId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [venture] = await ctx.db.select().from(ventures).where(eq(ventures.id, input.ventureId)).limit(1);
      if (!venture) throw new TRPCError({ code: 'NOT_FOUND', message: 'Venture not found' });
      if (ctx.user.role === 'pm' && venture.pmUserId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this venture' });
      }

      const ventureWorkstreams = await ctx.db
        .select()
        .from(workstreams)
        .where(eq(workstreams.ventureId, input.ventureId))
        .orderBy(workstreams.sortOrder);

      const wsIds = ventureWorkstreams.map(w => w.id);
      const allMilestones = wsIds.length > 0
        ? await ctx.db.select().from(milestones).where(inArray(milestones.workstreamId, wsIds))
        : [];

      const deps = await ctx.db
        .select()
        .from(taskDependencies)
        .where(eq(taskDependencies.ventureId, input.ventureId));

      // Compute Gantt positions relative to venture start date
      const ventureStart = new Date(venture.startDate);

      function daysDiff(from: Date, to: Date): number {
        return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
      }

      const ganttWorkstreams = ventureWorkstreams.map(ws => {
        const start = ws.actualStart ?? ws.baselineStart;
        const end = ws.actualEnd ?? ws.baselineEnd;
        const startDate = start ? new Date(start) : ventureStart;
        const endDate = end ? new Date(end) : ventureStart;

        return {
          id: ws.id,
          type: 'workstream' as const,
          name: ws.name,
          status: ws.status,
          completionPct: ws.completionPct,
          startOffsetDays: daysDiff(ventureStart, startDate),
          durationDays: Math.max(1, daysDiff(startDate, endDate)),
          sortOrder: ws.sortOrder,
        };
      });

      const ganttMilestones = allMilestones.map(ms => {
        const msDate = ms.actualCompletionDate ?? ms.dueDate;
        const date = new Date(msDate);

        return {
          id: ms.id,
          type: 'milestone' as const,
          name: ms.name,
          status: ms.status,
          workstreamId: ms.workstreamId,
          startOffsetDays: daysDiff(ventureStart, date),
          durationDays: 0, // milestones are point-in-time
        };
      });

      const dependencyLines = deps.map(d => ({
        id: d.id,
        sourceType: d.sourceType,
        sourceId: d.sourceId,
        targetType: d.targetType,
        targetId: d.targetId,
        dependencyType: d.dependencyType,
        lagDays: d.lagDays,
      }));

      return {
        ventureStartDate: venture.startDate,
        ventureEndDate: venture.targetEndDate,
        workstreams: ganttWorkstreams,
        milestones: ganttMilestones,
        dependencyLines,
      };
    }),
});
