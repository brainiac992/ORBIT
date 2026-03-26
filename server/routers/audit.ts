import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { auditTrail, ventures } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

export const auditRouter = router({
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
        .from(auditTrail)
        .where(eq(auditTrail.ventureId, input.ventureId))
        .orderBy(desc(auditTrail.changedAt));
    }),

  listForEntity: protectedProcedure
    .input(z.object({
      entityType: z.string().max(50),
      entityId: z.string().uuid(),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(auditTrail)
        .where(
          and(
            eq(auditTrail.entityType, input.entityType),
            eq(auditTrail.entityId, input.entityId),
          ),
        )
        .orderBy(desc(auditTrail.changedAt));
    }),
});
