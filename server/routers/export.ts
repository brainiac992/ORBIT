import { z } from 'zod';
import { router, protectedProcedure, requireRole } from '../trpc.js';
import {
  ventures, workstreams, milestones, risks, issues,
  budgetEntries, budgetForecasts, progressUpdates,
  resourceAssignments, resources, users,
} from '../db/schema.js';

import { eq, ne, desc, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import type { BudgetStatus } from '../../shared/enums.js';

function deriveBudgetStatus(approved: number, forecastAtCompletion: number): BudgetStatus {
  if (approved <= 0) return 'within_budget';
  const variance = approved - forecastAtCompletion;
  const variancePct = variance / approved;
  if (variance < 0) return 'over_budget';
  if (variancePct <= 0.10) return 'at_risk';
  return 'within_budget';
}

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
        ? await ctx.db.select().from(milestones).where(inArray(milestones.workstreamId, wsIds))
        : [];

      const ventureRisks = await ctx.db.select().from(risks).where(eq(risks.ventureId, input.ventureId));

      // Resolve risk owner names
      const riskOwnerIds = [...new Set(ventureRisks.map(r => r.ownerResourceId).filter((id): id is string => id != null))];
      let riskOwnerMap = new Map<string, string>();
      if (riskOwnerIds.length > 0) {
        const ownerResources = await ctx.db.select({ id: resources.id, name: resources.name }).from(resources).where(inArray(resources.id, riskOwnerIds));
        riskOwnerMap = new Map(ownerResources.map(r => [r.id, r.name]));
      }

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
        risks: ventureRisks.map(r => ({
          ...r,
          ownerName: r.ownerResourceId ? riskOwnerMap.get(r.ownerResourceId) ?? null : null,
        })),
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
      const expPmIds = [...new Set(allVentures.map(v => v.pmUserId))];
      const expUsers = expPmIds.length > 0
        ? await ctx.db.select().from(users).where(inArray(users.id, expPmIds))
        : [];
      const expUserMap = new Map(expUsers.map(u => [u.id, u]));

      const expVentureIds = allVentures.map(v => v.id);
      const allEntries = expVentureIds.length > 0
        ? await ctx.db.select().from(budgetEntries).where(inArray(budgetEntries.ventureId, expVentureIds))
        : [];
      const allForecasts = expVentureIds.length > 0
        ? await ctx.db.select().from(budgetForecasts).where(inArray(budgetForecasts.ventureId, expVentureIds))
        : [];
      const allEscalatedRisks = (await ctx.db.select().from(risks).where(eq(risks.escalated, true)))
        .filter(r => r.status === 'open');
      const allEscalatedIssues = (await ctx.db.select().from(issues).where(eq(issues.escalated, true)))
        .filter(i => i.status !== 'resolved');

      // Pre-index for O(1) lookups
      const expEntriesByVenture = new Map<string, typeof allEntries>();
      for (const e of allEntries) {
        const list = expEntriesByVenture.get(e.ventureId);
        if (list) list.push(e);
        else expEntriesByVenture.set(e.ventureId, [e]);
      }
      const expForecastsByVenture = new Map<string, typeof allForecasts>();
      for (const f of allForecasts) {
        const list = expForecastsByVenture.get(f.ventureId);
        if (list) list.push(f);
        else expForecastsByVenture.set(f.ventureId, [f]);
      }

      const ventureCards = allVentures.map(v => {
        const pm = expUserMap.get(v.pmUserId);
        const ventureEntries = expEntriesByVenture.get(v.id) ?? [];
        const actualSpend = ventureEntries
          .filter(e => e.entryType === 'actual' || e.entryType === 'correction')
          .reduce((s, e) => s + Number(e.amount), 0);
        const committedSpend = ventureEntries
          .filter(e => e.entryType === 'committed')
          .reduce((s, e) => s + Number(e.amount), 0);
        const ventureForecasts = expForecastsByVenture.get(v.id) ?? [];
        const latestForecast = ventureForecasts
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
        const forecastToComplete = latestForecast ? Number(latestForecast.forecastToComplete) : 0;
        const forecastAtCompletion = actualSpend + committedSpend + forecastToComplete;
        const approved = Number(v.approvedBudget || 0);

        const escalationCount =
          allEscalatedRisks.filter(r => r.ventureId === v.id).length +
          allEscalatedIssues.filter(i => i.ventureId === v.id).length;

        return {
          id: v.id,
          name: v.name,
          pmName: pm?.name ?? 'Unassigned',
          status: v.status,
          health: v.health,
          completionPct: v.completionPct,
          startDate: v.startDate,
          targetEndDate: v.targetEndDate,
          approvedBudget: approved,
          actualSpend,
          forecastAtCompletion,
          budgetStatus: deriveBudgetStatus(approved, forecastAtCompletion),
          escalationCount,
          updatedAt: v.updatedAt,
        };
      });

      const summary = {
        totalActive: ventureCards.length,
        onTrack: ventureCards.filter(v => v.health === 'on_track').length,
        atRisk: ventureCards.filter(v => v.health === 'at_risk').length,
        offTrack: ventureCards.filter(v => v.health === 'off_track').length,
      };

      return {
        exportedAt: new Date().toISOString(),
        summary,
        totalVentures: ventureCards.length,
        ventures: ventureCards,
      };
    }),
});
