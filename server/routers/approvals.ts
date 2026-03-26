import { z } from 'zod';
import { router, protectedProcedure, requireRole } from '../trpc.js';
import { approvals, ventures } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { APPROVAL_STATUS } from '../../shared/enums.js';
import { logAudit } from '../services/audit.js';

export const approvalsRouter = router({
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
        .from(approvals)
        .where(eq(approvals.ventureId, input.ventureId));
    }),

  listPending: protectedProcedure
    .use(requireRole('pmo'))
    .query(async ({ ctx }) => {
      return ctx.db
        .select()
        .from(approvals)
        .where(eq(approvals.status, 'pending'));
    }),

  create: protectedProcedure
    .use(requireRole('pm'))
    .input(z.object({
      entityType: z.string().max(50),
      entityId: z.string().uuid(),
      ventureId: z.string().uuid(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [venture] = await ctx.db.select().from(ventures).where(eq(ventures.id, input.ventureId)).limit(1);
      if (!venture) throw new TRPCError({ code: 'NOT_FOUND', message: 'Venture not found' });
      if (venture.pmUserId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this venture' });
      }

      const [approval] = await ctx.db.insert(approvals).values({
        entityType: input.entityType,
        entityId: input.entityId,
        ventureId: input.ventureId,
        status: 'pending',
        requestedBy: ctx.user.id,
        notes: input.notes,
      }).returning();

      return approval;
    }),

  decide: protectedProcedure
    .use(requireRole('pmo'))
    .input(z.object({
      id: z.string().uuid(),
      status: z.enum(['approved', 'rejected'] as const),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db.select().from(approvals).where(eq(approvals.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Approval not found' });
      if (existing.status !== 'pending') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Approval already decided' });
      }

      const [updated] = await ctx.db.update(approvals).set({
        status: input.status,
        decidedBy: ctx.user.id,
        decidedAt: new Date(),
        notes: input.notes ?? existing.notes,
      }).where(eq(approvals.id, input.id)).returning();

      await logAudit(ctx.db, {
        entityType: existing.entityType,
        entityId: existing.entityId,
        ventureId: existing.ventureId,
        action: input.status === 'approved' ? 'approved' : 'rejected',
        changedBy: ctx.user.id,
        fieldName: 'approval_status',
        oldValue: 'pending',
        newValue: input.status,
      });

      return updated;
    }),
});
