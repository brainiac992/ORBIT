import { z } from 'zod';
import { router, protectedProcedure, requireRole } from '../trpc.js';
import {
  ventures, workstreams, milestones, risks, issues,
  budgetEntries, budgetForecasts, progressUpdates,
  resourceAssignments, resources, users,
} from '../db/schema.js';
import { eq, ne, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

export const exportRouter = router({
  ventureReport: protectedProcedure
    .input(z.object({ ventureId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [venture] = await ctx.db.select().from(ventures).where(eq(ventures.id, input.ventureId)).limit(1);
      if (!venture) throw new TRPCError({ code: 'NOT_FOUND', message: 'Venture not found' });
      if (ctx.user.role === 'pm' && venture.pmUserId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this venture' });
      }

      // Fetch all related data
      const ventureWorkstreams = await ctx.db.select().from(workstreams).where(eq(workstreams.ventureId, input.ventureId)).orderBy(workstreams.sortOrder);

      const wsIds = ventureWorkstreams.map(w => w.id);
      const allMilestones = wsIds.length > 0
        ? (await ctx.db.select().from(milestones)).filter(m => wsIds.includes(m.workstreamId))
        : [];

      const ventureRisks = await ctx.db.select().from(risks).where(eq(risks.ventureId, input.ventureId));
      const ventureIssues = await ctx.db.select().from(issues).where(eq(issues.ventureId, input.ventureId));

      // Budget summary
      const entries = await ctx.db.select().from(budgetEntries).where(eq(budgetEntries.ventureId, input.ventureId));
      const [latestForecast] = await ctx.db.select().from(budgetForecasts)
        .where(eq(budgetForecasts.ventureId, input.ventureId))
        .orderBy(desc(budgetForecasts.createdAt))
        .limit(1);

      const actualSpend = entries
        .filter(e => e.entryType === 'actual' || e.entryType === 'correction')
        .reduce((sum, e) => sum + Number(e.amount), 0);
      const committedSpend = entries
        .filter(e => e.entryType === 'committed')
        .reduce((sum, e) => sum + Number(e.amount), 0);
      const forecastToComplete = latestForecast ? Number(latestForecast.forecastToComplete) : 0;

      // Latest progress update
      const [latestUpdate] = await ctx.db.select().from(progressUpdates)
        .where(eq(progressUpdates.ventureId, input.ventureId))
        .orderBy(desc(progressUpdates.submittedAt))
        .limit(1);

      // PM info
      const [pm] = await ctx.db.select().from(users).where(eq(users.id, venture.pmUserId)).limit(1);

      return {
        exportedAt: new Date().toISOString(),
        venture: {
          ...venture,
          pmName: pm?.name ?? 'Unknown',
        },
        workstreams: ventureWorkstreams.map(ws => ({
          ...ws,
          milestones: allMilestones.filter(m => m.workstreamId === ws.id),
        })),
        risks: ventureRisks,
        issues: ventureIssues,
        budget: {
          approvedBudget: Number(venture.approvedBudget || 0),
          actualSpend,
          committedSpend,
          forecastToComplete,
          forecastAtCompletion: actualSpend + committedSpend + forecastToComplete,
        },
        latestUpdate: latestUpdate ?? null,
      };
    }),

  portfolioReport: protectedProcedure
    .use(requireRole('gm', 'pmo'))
    .query(async ({ ctx }) => {
      const allVentures = await ctx.db.select().from(ventures).where(ne(ventures.status, 'archived'));
      const allUsers = await ctx.db.select().from(users);
      const allEntries = await ctx.db.select().from(budgetEntries);
      const allForecasts = await ctx.db.select().from(budgetForecasts);

      const venturesSummary = allVentures.map(v => {
        const pm = allUsers.find(u => u.id === v.pmUserId);
        const ventureEntries = allEntries.filter(e => e.ventureId === v.id);
        const actualSpend = ventureEntries
          .filter(e => e.entryType === 'actual' || e.entryType === 'correction')
          .reduce((s, e) => s + Number(e.amount), 0);
        const committedSpend = ventureEntries
          .filter(e => e.entryType === 'committed')
          .reduce((s, e) => s + Number(e.amount), 0);
        const latestForecast = allForecasts
          .filter(f => f.ventureId === v.id)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
        const forecastToComplete = latestForecast ? Number(latestForecast.forecastToComplete) : 0;

        return {
          id: v.id,
          name: v.name,
          pmName: pm?.name ?? 'Unassigned',
          status: v.status,
          health: v.health,
          completionPct: v.completionPct,
          startDate: v.startDate,
          targetEndDate: v.targetEndDate,
          approvedBudget: Number(v.approvedBudget || 0),
          actualSpend,
          forecastAtCompletion: actualSpend + committedSpend + forecastToComplete,
          updatedAt: v.updatedAt,
        };
      });

      return {
        exportedAt: new Date().toISOString(),
        totalVentures: venturesSummary.length,
        ventures: venturesSummary,
      };
    }),
});
