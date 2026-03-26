import { z } from 'zod';
import { router, protectedProcedure, requireRole } from '../trpc.js';
import { taskDependencies, ventures } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { DEPENDENCY_NODE_TYPE, DEPENDENCY_TYPE } from '../../shared/enums.js';

export const dependenciesRouter = router({
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
        .from(taskDependencies)
        .where(eq(taskDependencies.ventureId, input.ventureId));
    }),

  create: protectedProcedure
    .use(requireRole('pm', 'pmo'))
    .input(z.object({
      ventureId: z.string().uuid(),
      sourceType: z.enum(DEPENDENCY_NODE_TYPE),
      sourceId: z.string().uuid(),
      targetType: z.enum(DEPENDENCY_NODE_TYPE),
      targetId: z.string().uuid(),
      dependencyType: z.enum(DEPENDENCY_TYPE).default('finish_to_start'),
      lagDays: z.number().int().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      const [venture] = await ctx.db.select().from(ventures).where(eq(ventures.id, input.ventureId)).limit(1);
      if (!venture) throw new TRPCError({ code: 'NOT_FOUND', message: 'Venture not found' });
      if (ctx.user.role === 'pm' && venture.pmUserId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this venture' });
      }

      const [dep] = await ctx.db.insert(taskDependencies).values(input).returning();
      return dep;
    }),

  delete: protectedProcedure
    .use(requireRole('pm', 'pmo'))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [dep] = await ctx.db.select().from(taskDependencies).where(eq(taskDependencies.id, input.id)).limit(1);
      if (!dep) throw new TRPCError({ code: 'NOT_FOUND', message: 'Dependency not found' });

      const [venture] = await ctx.db.select().from(ventures).where(eq(ventures.id, dep.ventureId)).limit(1);
      if (!venture) throw new TRPCError({ code: 'NOT_FOUND', message: 'Venture not found' });
      if (ctx.user.role === 'pm' && venture.pmUserId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this venture' });
      }

      await ctx.db.delete(taskDependencies).where(eq(taskDependencies.id, input.id));
      return { success: true };
    }),
});
