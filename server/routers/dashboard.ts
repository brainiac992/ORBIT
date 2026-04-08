import { router, protectedProcedure, requireRole } from '../trpc.js';
import { z } from 'zod';
import {
  ventures, users, risks, issues, decisions,
  progressUpdates, budgetEntries, budgetForecasts, resourceAssignments, resources,
} from '../db/schema.js';
import { eq, ne, desc, inArray, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import type { BudgetStatus } from '../../shared/enums.js';

function getScoreBand(score: number): string {
  if (score <= 4) return 'green';
  if (score <= 8) return 'yellow';
  if (score <= 12) return 'amber';
  if (score <= 19) return 'red';
  return 'darkRed';
}

function computeRiskSummary(ventureRisks: { riskScore: number; weight: number; status: string }[]) {
  const openRisks = ventureRisks.filter(r => r.status === 'open');
  const countByBand = { green: 0, yellow: 0, amber: 0, red: 0, darkRed: 0 };
  let highestScore = 0;
  let sumScoreWeight = 0;
  let sumWeight = 0;

  for (const r of openRisks) {
    const band = getScoreBand(r.riskScore) as keyof typeof countByBand;
    countByBand[band]++;
    if (r.riskScore > highestScore) highestScore = r.riskScore;
    sumScoreWeight += r.riskScore * r.weight;
    sumWeight += r.weight;
  }

  return {
    topRiskScore: highestScore,
    weightedExposure: sumWeight > 0 ? Math.round((sumScoreWeight / sumWeight) * 100) / 100 : 0,
    riskCountByBand: countByBand,
    totalOpenRisks: openRisks.length,
  };
}

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

      const allEscalatedIssues = await ctx.db.select().from(issues).where(eq(issues.escalated, true));

      // Get budget summaries — fetch only for active ventures
      const ventureIds = allVentures.map(v => v.id);

      // Fetch all risks for active ventures (for score-band summaries)
      const allVentureRisks = ventureIds.length > 0
        ? await ctx.db.select().from(risks).where(inArray(risks.ventureId, ventureIds))
        : [];
      const risksByVenture = new Map<string, typeof allVentureRisks>();
      for (const r of allVentureRisks) {
        const list = risksByVenture.get(r.ventureId);
        if (list) list.push(r);
        else risksByVenture.set(r.ventureId, [r]);
      }
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
        const issueEscalationCount = allEscalatedIssues.filter(i => i.ventureId === v.id && i.status !== 'resolved').length;

        // Risk summary with score bands
        const ventureRiskList = risksByVenture.get(v.id) ?? [];
        const riskSummary = computeRiskSummary(ventureRiskList);

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
          escalationCount: issueEscalationCount, // backward compat — issue escalations only now
          topRiskScore: riskSummary.topRiskScore,
          riskCountByBand: riskSummary.riskCountByBand,
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
      console.log(`[dashboard.pmo] Found ${allVentures.length} non-archived ventures for user ${ctx.user.email} (role: ${ctx.user.role})`);
      const pmoPmIds = [...new Set(allVentures.map(v => v.pmUserId))];
      const pmoUsers = pmoPmIds.length > 0
        ? await ctx.db.select().from(users).where(inArray(users.id, pmoPmIds))
        : [];
      const pmoUserMap = new Map(pmoUsers.map(u => [u.id, u]));
      const allBlockerIssues = await ctx.db.select().from(issues).where(and(eq(issues.severity, 'blocker'), ne(issues.status, 'resolved')));
      const allOpenDecisions = await ctx.db.select().from(decisions).where(eq(decisions.status, 'open'));
      const allEscalatedRisks = await ctx.db.select().from(risks).where(eq(risks.escalated, true));
      const allEscalatedIssues = await ctx.db.select().from(issues).where(eq(issues.escalated, true));

      // Fetch all risks for active ventures for score-based summaries
      const pmoVentureIds = allVentures.map(v => v.id);
      const allPmoRisks = pmoVentureIds.length > 0
        ? await ctx.db.select().from(risks).where(inArray(risks.ventureId, pmoVentureIds))
        : [];
      const pmoRisksByVenture = new Map<string, typeof allPmoRisks>();
      for (const r of allPmoRisks) {
        const list = pmoRisksByVenture.get(r.ventureId);
        if (list) list.push(r);
        else pmoRisksByVenture.set(r.ventureId, [r]);
      }

      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Portfolio-level risk summary
      const portfolioRiskSummary = { green: 0, yellow: 0, amber: 0, red: 0, darkRed: 0 };
      for (const r of allPmoRisks) {
        if (r.status === 'open') {
          const band = getScoreBand(r.riskScore) as keyof typeof portfolioRiskSummary;
          portfolioRiskSummary[band]++;
        }
      }

      const ventureRows = allVentures.map(v => {
        const pm = pmoUserMap.get(v.pmUserId);
        const isStale = new Date(v.updatedAt) < sevenDaysAgo;

        // Risk summary with score bands
        const ventureRiskList = pmoRisksByVenture.get(v.id) ?? [];
        const riskSummary = computeRiskSummary(ventureRiskList);

        return {
          id: v.id,
          name: v.name,
          pmName: pm?.name ?? 'Unassigned',
          health: v.health,
          completionPct: v.completionPct,
          updatedAt: v.updatedAt,
          isStale,
          topRiskScore: riskSummary.topRiskScore,
          weightedExposure: riskSummary.weightedExposure,
        };
      });

      return {
        ventures: ventureRows,
        escalations: {
          risks: allEscalatedRisks,
          issues: allEscalatedIssues,
        },
        openDecisions: allOpenDecisions,
        openBlockers: allBlockerIssues,
        portfolioRiskSummary,
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

      const blockerIssuesList = await ctx.db
        .select()
        .from(issues)
        .where(and(eq(issues.ventureId, venture.id), eq(issues.severity, 'blocker'), ne(issues.status, 'resolved')));

      const openRisksList = await ctx.db
        .select()
        .from(risks)
        .where(eq(risks.ventureId, venture.id));

      const riskSummary = computeRiskSummary(openRisksList);

      return {
        venture,
        latestUpdate: latestUpdate ?? null,
        openBlockersCount: blockerIssuesList.length,
        openRisksCount: openRisksList.filter(r => r.status === 'open').length,
        topRiskScore: riskSummary.topRiskScore,
        weightedExposure: riskSummary.weightedExposure,
      };
    }),
});
