import { z } from 'zod';
import { router, protectedProcedure, requireRole } from '../trpc.js';
import { ventures, users } from '../db/schema.js';
import { eq, and, ne, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { VENTURE_STATUS, HEALTH_STATUS } from '../../shared/enums.js';
import { logAudit, logAuditDiff } from '../services/audit.js';

export const venturesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role === 'pm') {
      return ctx.db
        .select()
        .from(ventures)
        .where(and(eq(ventures.pmUserId, ctx.user.id), ne(ventures.status, 'archived')));
    }
    // GM and PMO see all non-archived
    return ctx.db
      .select()
      .from(ventures)
      .where(ne(ventures.status, 'archived'));
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [venture] = await ctx.db
        .select()
        .from(ventures)
        .where(eq(ventures.id, input.id))
        .limit(1);

      if (!venture) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Venture not found' });
      }

      if (ctx.user.role === 'pm' && venture.pmUserId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this venture' });
      }

      return venture;
    }),

  listPMs: protectedProcedure
    .use(requireRole('pmo'))
    .query(async ({ ctx }) => {
      return ctx.db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.role, 'pm'));
    }),

  create: protectedProcedure
    .use(requireRole('pmo'))
    .input(z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      ventureType: z.string().max(100).optional(),
      pmUserId: z.string().uuid(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format'),
      targetEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format'),
    }))
    .mutation(async ({ ctx, input }) => {
      const [venture] = await ctx.db.insert(ventures).values({
        ...input,
        status: 'planning',
        health: 'on_track',
        completionPct: 0,
        createdBy: ctx.user.id,
      }).returning();

      await logAudit(ctx.db, {
        entityType: 'venture',
        entityId: venture.id,
        ventureId: venture.id,
        action: 'created',
        changedBy: ctx.user.id,
      });

      return venture;
    }),

  update: protectedProcedure
    .use(requireRole('pmo', 'pm'))
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      ventureType: z.string().max(100).optional(),
      pmUserId: z.string().uuid().optional(),
      status: z.enum(VENTURE_STATUS).optional(),
      health: z.enum(HEALTH_STATUS).optional(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format').optional(),
      targetEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format').optional(),
      completionPct: z.number().int().min(0).max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      const [venture] = await ctx.db.select().from(ventures).where(eq(ventures.id, id)).limit(1);
      if (!venture) throw new TRPCError({ code: 'NOT_FOUND', message: 'Venture not found' });

      // PM can only update their own venture, and only status/health/completion
      if (ctx.user.role === 'pm') {
        if (venture.pmUserId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this venture' });
        }
        const pmAllowed = { health: updates.health, completionPct: updates.completionPct, status: updates.status };
        const [updated] = await ctx.db.update(ventures)
          .set({ ...pmAllowed, updatedAt: new Date() })
          .where(eq(ventures.id, id))
          .returning();

        await logAuditDiff(ctx.db, {
          entityType: 'venture', entityId: id, ventureId: id, changedBy: ctx.user.id,
          before: venture, after: pmAllowed,
        });

        return updated;
      }

      // PMO can update everything
      const [updated] = await ctx.db.update(ventures)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(ventures.id, id))
        .returning();

      await logAuditDiff(ctx.db, {
        entityType: 'venture', entityId: id, ventureId: id, changedBy: ctx.user.id,
        before: venture, after: updates,
      });

      return updated;
    }),

  archive: protectedProcedure
    .use(requireRole('pmo'))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db.select().from(ventures).where(eq(ventures.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Venture not found' });

      const [updated] = await ctx.db.update(ventures)
        .set({ status: 'archived', updatedAt: new Date() })
        .where(eq(ventures.id, input.id))
        .returning();

      await logAudit(ctx.db, {
        entityType: 'venture', entityId: input.id, ventureId: input.id,
        action: 'updated', fieldName: 'status',
        oldValue: existing.status, newValue: 'archived',
        changedBy: ctx.user.id,
      });

      return updated;
    }),

  portfolioSummary: protectedProcedure
    .use(requireRole('gm', 'pmo'))
    .query(async ({ ctx }) => {
      const allVentures = await ctx.db
        .select()
        .from(ventures)
        .where(ne(ventures.status, 'archived'));

      const summary = {
        totalActive: allVentures.length,
        onTrack: allVentures.filter(v => v.health === 'on_track').length,
        atRisk: allVentures.filter(v => v.health === 'at_risk').length,
        offTrack: allVentures.filter(v => v.health === 'off_track').length,
        complete: allVentures.filter(v => v.health === 'complete').length,
        totalApprovedBudget: allVentures.reduce((sum, v) => sum + Number(v.approvedBudget || 0), 0),
      };

      return { summary, ventures: allVentures };
    }),
});
