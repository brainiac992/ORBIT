import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { workstreams, ventures } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { WORKSTREAM_STATUS } from '../../shared/enums.js';
import { logAudit, logAuditDiff } from '../services/audit.js';

async function assertVentureAccess(ctx: any, ventureId: string) {
  const [venture] = await ctx.db.select().from(ventures).where(eq(ventures.id, ventureId)).limit(1);
  if (!venture) throw new TRPCError({ code: 'NOT_FOUND', message: 'Venture not found' });
  if (ctx.user.role === 'pm' && venture.pmUserId !== ctx.user.id) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this venture' });
  }
  if (ctx.user.role === 'gm') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Read-only access for GM role' });
  }
  return venture;
}

export const workstreamsRouter = router({
  list: protectedProcedure
    .input(z.object({ ventureId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Verify venture access
      const [venture] = await ctx.db.select().from(ventures).where(eq(ventures.id, input.ventureId)).limit(1);
      if (!venture) throw new TRPCError({ code: 'NOT_FOUND', message: 'Venture not found' });
      if (ctx.user.role === 'pm' && venture.pmUserId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this venture' });
      }

      return ctx.db
        .select()
        .from(workstreams)
        .where(eq(workstreams.ventureId, input.ventureId))
        .orderBy(workstreams.sortOrder);
    }),

  create: protectedProcedure
    .input(z.object({
      ventureId: z.string().uuid(),
      name: z.string().min(1).max(255),
      ownerResourceId: z.string().uuid().optional(),
      baselineStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format').optional(),
      baselineEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format').optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertVentureAccess(ctx, input.ventureId);
      const [ws] = await ctx.db.insert(workstreams).values({
        ...input,
        status: 'not_started',
        completionPct: 0,
      }).returning();

      await logAudit(ctx.db, {
        entityType: 'workstream', entityId: ws.id, ventureId: input.ventureId,
        action: 'created', changedBy: ctx.user.id,
      });

      return ws;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(255).optional(),
      ownerResourceId: z.string().uuid().nullable().optional(),
      baselineStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format').optional(),
      baselineEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format').optional(),
      actualStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format').nullable().optional(),
      actualEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format').nullable().optional(),
      status: z.enum(WORKSTREAM_STATUS).optional(),
      completionPct: z.number().int().min(0).max(100).optional(),
      sortOrder: z.number().int().min(0).max(9999).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const [ws] = await ctx.db.select().from(workstreams).where(eq(workstreams.id, id)).limit(1);
      if (!ws) throw new TRPCError({ code: 'NOT_FOUND', message: 'Workstream not found' });

      await assertVentureAccess(ctx, ws.ventureId);

      const [updated] = await ctx.db.update(workstreams)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(workstreams.id, id))
        .returning();

      await logAuditDiff(ctx.db, {
        entityType: 'workstream', entityId: id, ventureId: ws.ventureId, changedBy: ctx.user.id,
        before: ws, after: updates,
      });

      return updated;
    }),
});
