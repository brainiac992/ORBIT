import { router, protectedProcedure, requireRole } from '../trpc.js';
import { z } from 'zod';
import {
  ventures, users, risks, issues, blockers, decisions,
  progressUpdates, budgetEntries, budgetForecasts, resourceAssignments, resources,
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

export const dashboardRouter = router({
  gm: protectedProcedure
    .use(requireRole('gm', 'pmo'))
    .query(async ({ ctx }) => {
      const allVentures = await ctx.db
        .select()
        .from(ventures)
        .where(ne(ventures.status, 'archived'));

      // Fetch only users referenced by ventures
      const pmIds = [...new Set(allVentures.map(v => v.pmUserId))];
      const ventureUsers = pmIds.length > 0
        ? await ctx.db.select().from(users).where(inArray(users.id, pmIds))
        : [];
      const userMap = new Map(ventureUsers.map(u => [u.id, u]));

      const allEscalatedRisks = await ctx.db.select().from(risks).where(eq(risks.escalated, true));
      const allEscalatedIssues = await ctx.db.select().from(issues).where(eq(issues.escalated, true));

      // Get budget summaries — fetch only for active ventures
      const ventureIds = allVentures.map(v => v.id);
      const allEntries = ventureIds.length > 0
        ? await ctx.db.select().from(budgetEntries).where(inArray(budgetEntries.ventureId, ventureIds))
        : [];
      const allForecasts = ventureIds.length > 0
        ? await ctx.db.select().from(budgetForecasts).where(inArray(budgetForecasts.ventureId, ventureIds))
        : [];

      // Pre-index for O(1) lookups
      const entriesByVenture = new Map<string, typeof allEntries>();
      for (const e of allEntries) {
        const list = entriesByVenture.get(e.ventureId);
        if (list) list.push(e);
        else entriesByVenture.set(e.ventureId, [e]);
      }
      const forecastsByVenture = new Map<string, typeof allForecasts>();
      for (const f of allForecasts) {
        const list = forecastsByVenture.get(f.ventureId);
        if (list) list.push(f);
        else forecastsByVenture.set(f.ventureId, [f]);
      }

      const ventureCards = allVentures.map(v => {
        const pm = userMap.get(v.pmUserId);
        const escalationCount =
          allEscalatedRisks.filter(r => r.ventureId === v.id && r.status === 'open').length +
          allEscalatedIssues.filter(i => i.ventureId === v.id && i.status !== 'resolved').length;

        // Derive budget status
        const ventureEntries = entriesByVenture.get(v.id) ?? [];
        const actualSpend = ventureEntries
          .filter(e => e.entryType === 'actual' || e.entryType === 'correction')
          .reduce((s, e) => s + Number(e.amount), 0);
        const committedSpend = ventureEntries
          .filter(e => e.entryType === 'committed')
          .reduce((s, e) => s + Number(e.amount), 0);

        const ventureForecasts = forecastsByVenture.get(v.id) ?? [];
        const ventureForecast = ventureForecasts
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
        const forecastToComplete = ventureForecast ? Number(ventureForecast.forecastToComplete) : 0;
        const forecastAtCompletion = actualSpend + committedSpend + forecastToComplete;
        const approved = Number(v.approvedBudget || 0);

        return {
          id: v.id,
          name: v.name,
          pmName: pm?.name ?? 'Unassigned',
          health: v.health,
          completionPct: v.completionPct,
          approvedBudget: approved,
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
        complete: ventureCards.filter(v => v.health === 'complete').length,
        totalApprovedBudget: ventureCards.reduce((s, v) => s + v.approvedBudget, 0),
        totalForecast: ventureCards.reduce((s, v) => s + v.forecastAtCompletion, 0),
      };

      return { summary, ventures: ventureCards };
    }),

  pmo: protectedProcedure
    .use(requireRole('pmo'))
    .query(async ({ ctx }) => {
      const allVentures = await ctx.db.select().from(ventures).where(ne(ventures.status, 'archived'));
      const pmoPmIds = [...new Set(allVentures.map(v => v.pmUserId))];
      const pmoUsers = pmoPmIds.length > 0
        ? await ctx.db.select().from(users).where(inArray(users.id, pmoPmIds))
        : [];
      const pmoUserMap = new Map(pmoUsers.map(u => [u.id, u]));
      const allOpenBlockers = await ctx.db.select().from(blockers).where(eq(blockers.status, 'open'));
      const allOpenDecisions = await ctx.db.select().from(decisions).where(eq(decisions.status, 'open'));
      const allEscalatedRisks = await ctx.db.select().from(risks).where(eq(risks.escalated, true));
      const allEscalatedIssues = await ctx.db.select().from(issues).where(eq(issues.escalated, true));

      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const ventureRows = allVentures.map(v => {
        const pm = pmoUserMap.get(v.pmUserId);
        const isStale = new Date(v.updatedAt) < sevenDaysAgo;
        const openRisksCount = allEscalatedRisks.filter(r => r.ventureId === v.id).length;

        return {
          id: v.id,
          name: v.name,
          pmName: pm?.name ?? 'Unassigned',
          health: v.health,
          completionPct: v.completionPct,
          updatedAt: v.updatedAt,
          isStale,
          openRisksCount,
        };
      });

      return {
        ventures: ventureRows,
        escalations: {
          risks: allEscalatedRisks,
          issues: allEscalatedIssues,
        },
        openDecisions: allOpenDecisions,
        openBlockers: allOpenBlockers,
      };
    }),

  pm: protectedProcedure
    .use(requireRole('pm'))
    .query(async ({ ctx }) => {
      const [venture] = await ctx.db
        .select()
        .from(ventures)
        .where(eq(ventures.pmUserId, ctx.user.id))
        .limit(1);

      if (!venture) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No venture assigned to you' });
      }

      const [latestUpdate] = await ctx.db
        .select()
        .from(progressUpdates)
        .where(eq(progressUpdates.ventureId, venture.id))
        .orderBy(desc(progressUpdates.submittedAt))
        .limit(1);

      const openBlockersList = await ctx.db
        .select()
        .from(blockers)
        .where(eq(blockers.ventureId, venture.id));

      const openRisksList = await ctx.db
        .select()
        .from(risks)
        .where(eq(risks.ventureId, venture.id));

      return {
        venture,
        latestUpdate: latestUpdate ?? null,
        openBlockersCount: openBlockersList.filter(b => b.status === 'open').length,
        openRisksCount: openRisksList.filter(r => r.status === 'open').length,
      };
    }),
});
