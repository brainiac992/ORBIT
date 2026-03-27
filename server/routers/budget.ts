import { z } from 'zod';
import { router, protectedProcedure, requireRole } from '../trpc.js';
import { budgetEntries, budgetForecasts, ventures } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { BUDGET_CATEGORY, BUDGET_ENTRY_TYPE } from '../../shared/enums.js';
import type { BudgetStatus } from '../../shared/enums.js';
import { logAudit } from '../services/audit.js';

function deriveBudgetStatus(approved: number, forecastAtCompletion: number): BudgetStatus {
  if (approved <= 0) return 'within_budget';
  const variance = approved - forecastAtCompletion;
  const variancePct = variance / approved;
  if (variance < 0) return 'over_budget';
  if (variancePct <= 0.10) return 'at_risk';
  return 'within_budget';
}

export const budgetRouter = router({
  setBudget: protectedProcedure
    .use(requireRole('pmo'))
    .input(z.object({
      ventureId: z.string().uuid(),
      amount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid positive number'),
    }))
    .mutation(async ({ ctx, input }) => {
      const [venture] = await ctx.db.select().from(ventures).where(eq(ventures.id, input.ventureId)).limit(1);
      if (!venture) throw new TRPCError({ code: 'NOT_FOUND', message: 'Venture not found' });
      if (venture.budgetLocked) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Budget already approved and locked. Cannot change approved budget.' });
      }

      const [updated] = await ctx.db.update(ventures).set({
        approvedBudget: input.amount,
        budgetLocked: true,
        updatedAt: new Date(),
      }).where(eq(ventures.id, input.ventureId)).returning();

      await logAudit(ctx.db, {
        entityType: 'budget_entry', entityId: input.ventureId, ventureId: input.ventureId,
        action: 'approved', fieldName: 'approved_budget',
        oldValue: venture.approvedBudget ? String(venture.approvedBudget) : null,
        newValue: input.amount,
        changedBy: ctx.user.id,
      });

      return updated;
    }),

  logEntry: protectedProcedure
    .input(z.object({
      ventureId: z.string().uuid(),
      entryType: z.enum(BUDGET_ENTRY_TYPE),
      amount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid positive number'),
      entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format'),
      category: z.enum(BUDGET_CATEGORY),
      description: z.string().min(1),
      vendor: z.string().max(255).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [venture] = await ctx.db.select().from(ventures).where(eq(ventures.id, input.ventureId)).limit(1);
      if (!venture) throw new TRPCError({ code: 'NOT_FOUND', message: 'Venture not found' });
      if (ctx.user.role === 'pm' && venture.pmUserId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this venture' });
      }
      if (ctx.user.role === 'gm') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'GM cannot log budget entries' });
      }

      // Insert only — no update path
      const [entry] = await ctx.db.insert(budgetEntries).values({
        ...input,
        createdBy: ctx.user.id,
      }).returning();

      await logAudit(ctx.db, {
        entityType: 'budget_entry', entityId: entry.id, ventureId: input.ventureId,
        action: 'created', fieldName: 'amount', newValue: input.amount,
        changedBy: ctx.user.id,
      });

      return entry;
    }),

  updateForecast: protectedProcedure
    .input(z.object({
      ventureId: z.string().uuid(),
      forecastToComplete: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid positive number'),
    }))
    .mutation(async ({ ctx, input }) => {
      const [venture] = await ctx.db.select().from(ventures).where(eq(ventures.id, input.ventureId)).limit(1);
      if (!venture) throw new TRPCError({ code: 'NOT_FOUND', message: 'Venture not found' });
      if (ctx.user.role === 'pm' && venture.pmUserId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      if (ctx.user.role === 'gm') throw new TRPCError({ code: 'FORBIDDEN' });

      // Append-only — latest record per venture is the active forecast
      const [forecast] = await ctx.db.insert(budgetForecasts).values({
        ventureId: input.ventureId,
        forecastToComplete: input.forecastToComplete,
        createdBy: ctx.user.id,
      }).returning();

      return forecast;
    }),

  summary: protectedProcedure
    .input(z.object({ ventureId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [venture] = await ctx.db.select().from(ventures).where(eq(ventures.id, input.ventureId)).limit(1);
      if (!venture) throw new TRPCError({ code: 'NOT_FOUND', message: 'Venture not found' });
      if (ctx.user.role === 'pm' && venture.pmUserId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }

      const entries = await ctx.db
        .select()
        .from(budgetEntries)
        .where(eq(budgetEntries.ventureId, input.ventureId))
        .orderBy(desc(budgetEntries.createdAt));

      const [latestForecast] = await ctx.db
        .select()
        .from(budgetForecasts)
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
      const forecastAtCompletion = actualSpend + committedSpend + forecastToComplete;
      const approvedBudget = Number(venture.approvedBudget || 0);
      const budgetVariance = approvedBudget - forecastAtCompletion;

      // Category breakdown
      const byCategory = {
        people: entries.filter(e => e.category === 'people').reduce((s, e) => s + Number(e.amount), 0),
        technology: entries.filter(e => e.category === 'technology').reduce((s, e) => s + Number(e.amount), 0),
        vendors: entries.filter(e => e.category === 'vendors').reduce((s, e) => s + Number(e.amount), 0),
        other: entries.filter(e => e.category === 'other').reduce((s, e) => s + Number(e.amount), 0),
      };

      return {
        approvedBudget,
        budgetLocked: venture.budgetLocked,
        actualSpend,
        committedSpend,
        forecastToComplete,
        forecastAtCompletion,
        budgetVariance,
        budgetStatus: deriveBudgetStatus(approvedBudget, forecastAtCompletion),
        byCategory,
        entries,
        latestForecast,
      };
    }),
});
