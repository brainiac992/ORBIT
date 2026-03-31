import { z } from 'zod';
import { router, protectedProcedure, requireRole } from '../trpc.js';
import { artifacts, ventures, users } from '../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { ARTIFACT_STAGE } from '../../shared/enums.js';
import { logAudit } from '../services/audit.js';

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

export const artifactsRouter = router({
  list: protectedProcedure
    .input(z.object({ ventureId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [venture] = await ctx.db.select().from(ventures).where(eq(ventures.id, input.ventureId)).limit(1);
      if (!venture) throw new TRPCError({ code: 'NOT_FOUND', message: 'Venture not found' });
      if (ctx.user.role === 'pm' && venture.pmUserId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }

      const rows = await ctx.db
        .select()
        .from(artifacts)
        .where(eq(artifacts.ventureId, input.ventureId))
        .orderBy(artifacts.createdAt);

      // Fetch uploader names
      const uploaderIds = [...new Set(rows.map(r => r.uploadedBy))];
      const uploaders = uploaderIds.length > 0
        ? await ctx.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, uploaderIds))
        : [];
      const uploaderMap = new Map(uploaders.map(u => [u.id, u.name]));

      return rows.map(r => ({
        ...r,
        uploadedByName: uploaderMap.get(r.uploadedBy) ?? 'Unknown',
      }));
    }),

  create: protectedProcedure
    .use(requireRole('pm', 'pmo'))
    .input(z.object({
      ventureId: z.string().uuid(),
      name: z.string().min(1).max(255),
      description: z.string().max(1000).optional(),
      stage: z.enum(ARTIFACT_STAGE),
      fileName: z.string().min(1).max(500),
      fileSize: z.number().int().nonnegative().optional(),
      mimeType: z.string().max(255).optional(),
      s3Key: z.string().max(1000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertVentureAccess(ctx, input.ventureId);

      const [artifact] = await ctx.db.insert(artifacts).values({
        ...input,
        uploadedBy: ctx.user.id,
      }).returning();

      await logAudit(ctx.db, {
        entityType: 'artifact',
        entityId: artifact.id,
        ventureId: input.ventureId,
        action: 'created',
        changedBy: ctx.user.id,
      });

      return artifact;
    }),

  update: protectedProcedure
    .use(requireRole('pm', 'pmo'))
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(255).optional(),
      description: z.string().max(1000).optional(),
      stage: z.enum(ARTIFACT_STAGE).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const [artifact] = await ctx.db.select().from(artifacts).where(eq(artifacts.id, id)).limit(1);
      if (!artifact) throw new TRPCError({ code: 'NOT_FOUND' });

      await assertVentureAccess(ctx, artifact.ventureId);

      const [updated] = await ctx.db.update(artifacts)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(artifacts.id, id))
        .returning();

      return updated;
    }),

  delete: protectedProcedure
    .use(requireRole('pm', 'pmo'))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [artifact] = await ctx.db.select().from(artifacts).where(eq(artifacts.id, input.id)).limit(1);
      if (!artifact) throw new TRPCError({ code: 'NOT_FOUND' });

      await assertVentureAccess(ctx, artifact.ventureId);

      await ctx.db.delete(artifacts).where(eq(artifacts.id, input.id));

      await logAudit(ctx.db, {
        entityType: 'artifact',
        entityId: input.id,
        ventureId: artifact.ventureId,
        action: 'deleted',
        changedBy: ctx.user.id,
      });

      return { success: true };
    }),

  // Presigned URL endpoint — stub for future S3 integration
  getUploadUrl: protectedProcedure
    .use(requireRole('pm', 'pmo'))
    .input(z.object({
      ventureId: z.string().uuid(),
      fileName: z.string().min(1).max(500),
      mimeType: z.string().max(255),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertVentureAccess(ctx, input.ventureId);

      // TODO: Generate presigned S3 upload URL
      // For now, return a placeholder
      const s3Key = `artifacts/${input.ventureId}/${Date.now()}-${input.fileName}`;

      return {
        uploadUrl: null, // Will be presigned URL when S3 is integrated
        s3Key,
      };
    }),
});
