import { z } from 'zod';
import { router, protectedProcedure, requireRole } from '../trpc.js';
import { resources, resourceAssignments, ventures } from '../db/schema.js';
import { eq, and, or, isNull, gte, sql, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { RESOURCE_TYPE } from '../../shared/enums.js';
import { logAuditDiff } from '../services/audit.js';

export const resourcesRouter = router({
  list: protectedProcedure
    .use(requireRole('pmo', 'pm'))
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

      const assignedResources = await ctx.db.select().from(resources).where(inArray(resources.id, resourceIds));

      return assignedResources.map(r => ({
        ...r,
        assignments: assignments.filter(a => a.resourceId === r.id),
      }));
    }),

  create: protectedProcedure
    .use(requireRole('pmo', 'pm'))
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
    .use(requireRole('pmo', 'pm'))
    .input(z.object({
      resourceId: z.string().uuid(),
      ventureId: z.string().uuid(),
      hoursPerWeek: z.string(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format'),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format').optional(),
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

  update: protectedProcedure
    .use(requireRole('pmo'))
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(255).optional(),
      type: z.enum(RESOURCE_TYPE).optional(),
      roleTitle: z.string().max(255).nullable().optional(),
      department: z.string().max(255).nullable().optional(),
      company: z.string().max(255).nullable().optional(),
      active: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const [resource] = await ctx.db.select().from(resources).where(eq(resources.id, id)).limit(1);
      if (!resource) throw new TRPCError({ code: 'NOT_FOUND', message: 'Resource not found' });

      const [updated] = await ctx.db.update(resources)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(resources.id, id))
        .returning();

      await logAuditDiff(ctx.db, {
        entityType: 'resource', entityId: id, changedBy: ctx.user.id,
        before: resource, after: updates,
      });

      return updated;
    }),

  capacityPlan: protectedProcedure
    .use(requireRole('pmo'))
    .query(async ({ ctx }) => {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      const allResources = await ctx.db.select().from(resources).where(eq(resources.active, true));
      const allAssignments = await ctx.db.select().from(resourceAssignments);
      const ventureIds = [...new Set(allAssignments.map(a => a.ventureId))];
      const allVentures = ventureIds.length > 0
        ? await ctx.db.select().from(ventures).where(inArray(ventures.id, ventureIds))
        : [];
      const ventureMap = new Map(allVentures.map(v => [v.id, v]));

      // Pre-index assignments by resourceId for O(1) lookup
      const assignmentsByResource = new Map<string, typeof allAssignments>();
      for (const a of allAssignments) {
        const list = assignmentsByResource.get(a.resourceId);
        if (list) list.push(a);
        else assignmentsByResource.set(a.resourceId, [a]);
      }

      // Per-resource breakdown with venture HpW
      const resourceBreakdowns = allResources.map(r => {
        const rAssignments = assignmentsByResource.get(r.id) ?? [];
        const activeAssignments = rAssignments.filter(a =>
          a.endDate === null || a.endDate >= todayStr
        );

        const ventureBreakdown = activeAssignments.map(a => {
          const venture = ventureMap.get(a.ventureId);
          return {
            ventureId: a.ventureId,
            ventureName: venture?.name ?? 'Unknown',
            hoursPerWeek: Number(a.hoursPerWeek),
            startDate: a.startDate,
            endDate: a.endDate,
          };
        });

        const totalHpw = ventureBreakdown.reduce((sum, v) => sum + v.hoursPerWeek, 0);

        return {
          id: r.id,
          name: r.name,
          type: r.type,
          roleTitle: r.roleTitle,
          department: r.department,
          totalHoursPerWeek: totalHpw,
          availableHoursPerWeek: Math.max(0, 40 - totalHpw),
          overAllocated: totalHpw > 40,
          ventureBreakdown,
        };
      });

      // Weekly capacity view for next 12 weeks
      const weeklyCapacity = [];
      for (let w = 0; w < 12; w++) {
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() + (w * 7) - today.getDay() + 1); // Monday
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);

        const weekStartStr = weekStart.toISOString().split('T')[0];
        const weekEndStr = weekEnd.toISOString().split('T')[0];

        let totalAvailable = allResources.length * 40;
        let totalAllocated = 0;

        for (const r of allResources) {
          const rAssignments = assignmentsByResource.get(r.id) ?? [];
          const active = rAssignments.filter(a =>
            a.startDate <= weekEndStr &&
            (a.endDate === null || a.endDate >= weekStartStr)
          );
          totalAllocated += active.reduce((sum, a) => sum + Number(a.hoursPerWeek), 0);
        }

        weeklyCapacity.push({
          weekStart: weekStartStr,
          weekEnd: weekEndStr,
          totalAvailableHpw: totalAvailable,
          totalAllocatedHpw: totalAllocated,
          utilizationPct: totalAvailable > 0 ? Math.round((totalAllocated / totalAvailable) * 100) : 0,
        });
      }

      return { resources: resourceBreakdowns, weeklyCapacity };
    }),

  ventureAllocationBreakdown: protectedProcedure
    .input(z.object({ ventureId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [venture] = await ctx.db.select().from(ventures).where(eq(ventures.id, input.ventureId)).limit(1);
      if (!venture) throw new TRPCError({ code: 'NOT_FOUND', message: 'Venture not found' });
      if (ctx.user.role === 'pm' && venture.pmUserId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this venture' });
      }

      const todayStr = new Date().toISOString().split('T')[0];

      const assignments = await ctx.db.select().from(resourceAssignments)
        .where(eq(resourceAssignments.ventureId, input.ventureId));

      const activeAssignments = assignments.filter(a =>
        a.endDate === null || a.endDate >= todayStr
      );

      const activeResourceIds = [...new Set(activeAssignments.map(a => a.resourceId))];
      const assignedResources = activeResourceIds.length > 0
        ? await ctx.db.select().from(resources).where(inArray(resources.id, activeResourceIds))
        : [];
      const resourceMap = new Map(assignedResources.map(r => [r.id, r]));

      // Group by resource type (internal/external)
      const byType: Record<string, number> = { internal: 0, external: 0 };

      for (const a of activeAssignments) {
        const resource = resourceMap.get(a.resourceId);
        if (resource) {
          const type = resource.type;
          byType[type] = (byType[type] || 0) + Number(a.hoursPerWeek);
        }
      }

      return {
        ventureId: input.ventureId,
        ventureName: venture.name,
        totalHoursPerWeek: byType.internal + byType.external,
        byResourceType: byType,
        assignments: activeAssignments.map(a => {
          const resource = resourceMap.get(a.resourceId);
          return {
            resourceId: a.resourceId,
            resourceName: resource?.name ?? 'Unknown',
            resourceType: resource?.type ?? 'internal',
            roleTitle: resource?.roleTitle,
            hoursPerWeek: Number(a.hoursPerWeek),
            startDate: a.startDate,
            endDate: a.endDate,
          };
        }),
      };
    }),
});
