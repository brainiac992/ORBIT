import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import {
  workstreamRaciAssignments, workstreams, resources, resourceAssignments, ventures,
} from '../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { RACI_ROLE } from '../../shared/enums.js';
import { logAudit } from '../services/audit.js';

async function assertVentureReadAccess(ctx: any, ventureId: string) {
  const [venture] = await ctx.db.select().from(ventures).where(eq(ventures.id, ventureId)).limit(1);
  if (!venture) throw new TRPCError({ code: 'NOT_FOUND', message: 'Venture not found' });
  if (ctx.user.role === 'pm' && venture.pmUserId !== ctx.user.id) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this venture' });
  }
  return venture;
}

export const raciRouter = router({
  listForWorkstream: protectedProcedure
    .input(z.object({ workstreamId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Resolve workstream to get ventureId
      const [ws] = await ctx.db.select().from(workstreams).where(eq(workstreams.id, input.workstreamId)).limit(1);
      if (!ws) throw new TRPCError({ code: 'NOT_FOUND', message: 'Workstream not found' });
      await assertVentureReadAccess(ctx, ws.ventureId);

      const assignments = await ctx.db.select().from(workstreamRaciAssignments)
        .where(eq(workstreamRaciAssignments.workstreamId, input.workstreamId));

      // Resolve resource names
      const resourceIds = [...new Set(assignments.map(a => a.resourceId))];
      let resourceMap = new Map<string, { name: string; active: boolean }>();
      if (resourceIds.length > 0) {
        const res = await ctx.db.select({ id: resources.id, name: resources.name, active: resources.active })
          .from(resources).where(inArray(resources.id, resourceIds));
        resourceMap = new Map(res.map(r => [r.id, { name: r.name, active: r.active }]));
      }

      return assignments.map(a => ({
        ...a,
        workstreamName: ws.name,
        resourceName: resourceMap.get(a.resourceId)?.name ?? 'Unknown',
        resourceActive: resourceMap.get(a.resourceId)?.active ?? false,
      }));
    }),

  listForVenture: protectedProcedure
    .input(z.object({ ventureId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertVentureReadAccess(ctx, input.ventureId);

      // Get all workstreams for venture
      const ventureWorkstreams = await ctx.db.select().from(workstreams)
        .where(eq(workstreams.ventureId, input.ventureId));

      if (ventureWorkstreams.length === 0) return [];

      const wsIds = ventureWorkstreams.map(ws => ws.id);
      const wsMap = new Map(ventureWorkstreams.map(ws => [ws.id, ws.name]));

      // Get all RACI assignments for these workstreams
      const assignments = await ctx.db.select().from(workstreamRaciAssignments)
        .where(inArray(workstreamRaciAssignments.workstreamId, wsIds));

      if (assignments.length === 0) return [];

      // Resolve resource names
      const resourceIds = [...new Set(assignments.map(a => a.resourceId))];
      const res = resourceIds.length > 0
        ? await ctx.db.select({ id: resources.id, name: resources.name, active: resources.active })
            .from(resources).where(inArray(resources.id, resourceIds))
        : [];
      const resourceMap = new Map(res.map(r => [r.id, { name: r.name, active: r.active }]));

      // Check venture resource assignments for isVentureAssigned
      const ventureAssignments = resourceIds.length > 0
        ? await ctx.db.select({ resourceId: resourceAssignments.resourceId })
            .from(resourceAssignments)
            .where(and(
              eq(resourceAssignments.ventureId, input.ventureId),
              inArray(resourceAssignments.resourceId, resourceIds),
            ))
        : [];
      const ventureAssignedSet = new Set(ventureAssignments.map(a => a.resourceId));

      return assignments.map(a => ({
        id: a.id,
        workstreamId: a.workstreamId,
        workstreamName: wsMap.get(a.workstreamId) ?? 'Unknown',
        resourceId: a.resourceId,
        resourceName: resourceMap.get(a.resourceId)?.name ?? 'Unknown',
        resourceActive: resourceMap.get(a.resourceId)?.active ?? false,
        isVentureAssigned: ventureAssignedSet.has(a.resourceId),
        raciRole: a.raciRole,
        createdBy: a.createdBy,
        createdAt: a.createdAt,
      }));
    }),

  assign: protectedProcedure
    .input(z.object({
      workstreamId: z.string().uuid(),
      resourceId: z.string().uuid(),
      raciRole: z.enum(RACI_ROLE),
    }))
    .mutation(async ({ ctx, input }) => {
      // Resolve workstream to get ventureId
      const [ws] = await ctx.db.select().from(workstreams).where(eq(workstreams.id, input.workstreamId)).limit(1);
      if (!ws) throw new TRPCError({ code: 'NOT_FOUND', message: 'Workstream not found' });
      await assertVentureReadAccess(ctx, ws.ventureId);
      if (ctx.user.role === 'gm') throw new TRPCError({ code: 'FORBIDDEN', message: 'GM cannot modify RACI assignments' });

      // Wrap check + insert in transaction to prevent race condition (CRITICAL-02 fix)
      try {
        const assignment = await ctx.db.transaction(async (tx) => {
          // Enforce: at most 1 Accountable per workstream
          if (input.raciRole === 'accountable') {
            const existing = await tx.select().from(workstreamRaciAssignments)
              .where(and(
                eq(workstreamRaciAssignments.workstreamId, input.workstreamId),
                eq(workstreamRaciAssignments.raciRole, 'accountable'),
              )).limit(1);
            if (existing.length > 0) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'Only one Accountable is allowed per workstream.',
              });
            }
          }

          const [row] = await tx.insert(workstreamRaciAssignments).values({
            workstreamId: input.workstreamId,
            resourceId: input.resourceId,
            raciRole: input.raciRole,
            createdBy: ctx.user.id,
          }).returning();

          return row;
        });

        await logAudit(ctx.db, {
          entityType: 'workstream_raci_assignment', entityId: assignment.id, ventureId: ws.ventureId,
          action: 'created', changedBy: ctx.user.id,
          newValue: `${input.raciRole} - resourceId: ${input.resourceId}`,
        });

        return assignment;
      } catch (err: any) {
        if (err instanceof TRPCError) throw err;
        // Catch unique constraint violation
        if (err?.code === '23505') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'This resource already has this RACI role for this workstream.',
          });
        }
        throw err;
      }
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [assignment] = await ctx.db.select().from(workstreamRaciAssignments)
        .where(eq(workstreamRaciAssignments.id, input.id)).limit(1);
      if (!assignment) throw new TRPCError({ code: 'NOT_FOUND', message: 'RACI assignment not found' });

      // Resolve workstream to get ventureId
      const [ws] = await ctx.db.select().from(workstreams).where(eq(workstreams.id, assignment.workstreamId)).limit(1);
      if (!ws) throw new TRPCError({ code: 'NOT_FOUND', message: 'Workstream not found' });
      await assertVentureReadAccess(ctx, ws.ventureId);
      if (ctx.user.role === 'gm') throw new TRPCError({ code: 'FORBIDDEN', message: 'GM cannot modify RACI assignments' });

      await ctx.db.delete(workstreamRaciAssignments).where(eq(workstreamRaciAssignments.id, input.id));

      await logAudit(ctx.db, {
        entityType: 'workstream_raci_assignment', entityId: input.id, ventureId: ws.ventureId,
        action: 'deleted', changedBy: ctx.user.id,
        oldValue: `${assignment.raciRole} - resourceId: ${assignment.resourceId}`,
      });

      return { success: true };
    }),

  bulkUpdate: protectedProcedure
    .input(z.object({
      workstreamId: z.string().uuid(),
      assignments: z.array(z.object({
        resourceId: z.string().uuid(),
        raciRole: z.enum(RACI_ROLE),
      })).max(100),
    }))
    .mutation(async ({ ctx, input }) => {
      // Resolve workstream to get ventureId
      const [ws] = await ctx.db.select().from(workstreams).where(eq(workstreams.id, input.workstreamId)).limit(1);
      if (!ws) throw new TRPCError({ code: 'NOT_FOUND', message: 'Workstream not found' });
      await assertVentureReadAccess(ctx, ws.ventureId);
      if (ctx.user.role === 'gm') throw new TRPCError({ code: 'FORBIDDEN', message: 'GM cannot modify RACI assignments' });

      // Validate: at most 1 Accountable
      const accountableCount = input.assignments.filter(a => a.raciRole === 'accountable').length;
      if (accountableCount > 1) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only one Accountable is allowed per workstream.',
        });
      }

      // Wrap delete + insert in a transaction to prevent race conditions (CRITICAL-01 fix)
      const inserted = await ctx.db.transaction(async (tx) => {
        await tx.delete(workstreamRaciAssignments)
          .where(eq(workstreamRaciAssignments.workstreamId, input.workstreamId));

        if (input.assignments.length === 0) return [];

        const values = input.assignments.map(a => ({
          workstreamId: input.workstreamId,
          resourceId: a.resourceId,
          raciRole: a.raciRole as typeof RACI_ROLE[number],
          createdBy: ctx.user.id,
        }));

        return tx.insert(workstreamRaciAssignments).values(values).returning();
      });

      await logAudit(ctx.db, {
        entityType: 'workstream_raci_assignment', entityId: input.workstreamId, ventureId: ws.ventureId,
        action: 'updated', changedBy: ctx.user.id,
        newValue: input.assignments.length === 0 ? 'Cleared all RACI assignments' : `Bulk set ${input.assignments.length} assignments`,
      });

      return inserted;
    }),

  listVentureResources: protectedProcedure
    .input(z.object({ ventureId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertVentureReadAccess(ctx, input.ventureId);

      // Get active resources assigned to this venture
      const assignments = await ctx.db.select({ resourceId: resourceAssignments.resourceId })
        .from(resourceAssignments)
        .where(eq(resourceAssignments.ventureId, input.ventureId));

      if (assignments.length === 0) return [];

      const resourceIds = [...new Set(assignments.map(a => a.resourceId))];
      const ventureResources = await ctx.db.select({
        id: resources.id,
        name: resources.name,
        roleTitle: resources.roleTitle,
      }).from(resources).where(
        and(
          inArray(resources.id, resourceIds),
          eq(resources.active, true),
        )
      );

      return ventureResources;
    }),
});
