import { z } from 'zod';
import { router, protectedProcedure, requireRole } from '../trpc.js';
import { resources, resourceAssignments, ventures } from '../db/schema.js';
import { eq, and, or, isNull, gte, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { RESOURCE_TYPE } from '../../shared/enums.js';

export const resourcesRouter = router({
  list: protectedProcedure
    .use(requireRole('pmo'))
    .query(async ({ ctx }) => {
      return ctx.db.select().from(resources).orderBy(resources.name);
    }),

  listForVenture: protectedProcedure
    .input(z.object({ ventureId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [venture] = await ctx.db.select().from(ventures).where(eq(ventures.id, input.ventureId)).limit(1);
      if (!venture) throw new TRPCError({ code: 'NOT_FOUND', message: 'Venture not found' });
      if (ctx.user.role === 'pm' && venture.pmUserId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this venture' });
      }

      const assignments = await ctx.db
        .select()
        .from(resourceAssignments)
        .where(eq(resourceAssignments.ventureId, input.ventureId));

      const resourceIds = [...new Set(assignments.map(a => a.resourceId))];
      if (resourceIds.length === 0) return [];

      const allResources = await ctx.db.select().from(resources);
      const assignedResources = allResources.filter(r => resourceIds.includes(r.id));

      return assignedResources.map(r => ({
        ...r,
        assignments: assignments.filter(a => a.resourceId === r.id),
      }));
    }),

  create: protectedProcedure
    .use(requireRole('pmo'))
    .input(z.object({
      name: z.string().min(1).max(255),
      type: z.enum(RESOURCE_TYPE),
      roleTitle: z.string().max(255).optional(),
      department: z.string().max(255).optional(),
      company: z.string().max(255).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [resource] = await ctx.db.insert(resources).values(input).returning();
      return resource;
    }),

  assign: protectedProcedure
    .use(requireRole('pmo'))
    .input(z.object({
      resourceId: z.string().uuid(),
      ventureId: z.string().uuid(),
      hoursPerWeek: z.string(),
      startDate: z.string(),
      endDate: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [assignment] = await ctx.db.insert(resourceAssignments).values({
        ...input,
        createdBy: ctx.user.id,
      }).returning();
      return assignment;
    }),

  allocationSummary: protectedProcedure
    .use(requireRole('pmo'))
    .query(async ({ ctx }) => {
      const today = new Date().toISOString().split('T')[0];

      const allResources = await ctx.db.select().from(resources).where(eq(resources.active, true));
      const allAssignments = await ctx.db.select().from(resourceAssignments);

      return allResources.map(r => {
        const activeAssignments = allAssignments.filter(a =>
          a.resourceId === r.id &&
          (a.endDate === null || a.endDate >= today)
        );
        const totalHpw = activeAssignments.reduce((sum, a) => sum + Number(a.hoursPerWeek), 0);
        return {
          ...r,
          totalHoursPerWeek: totalHpw,
          overAllocated: totalHpw > 40,
          activeAssignments,
        };
      });
    }),
});
