import { z } from 'zod';
import { router, protectedProcedure, requireRole } from '../trpc.js';
import { configOptions } from '../db/schema.js';
import { eq, and, asc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

const VALID_CATEGORIES = ['role_title', 'department', 'venture_type', 'budget_category', 'resource_type'] as const;

const SEED_DATA: Record<string, { label: string; value: string }[]> = {
  role_title: [
    { label: 'Senior Developer', value: 'Senior Developer' },
    { label: 'Developer', value: 'Developer' },
    { label: 'QA Engineer', value: 'QA Engineer' },
    { label: 'Project Manager', value: 'Project Manager' },
    { label: 'Business Analyst', value: 'Business Analyst' },
    { label: 'Designer', value: 'Designer' },
    { label: 'DevOps Engineer', value: 'DevOps Engineer' },
    { label: 'Data Engineer', value: 'Data Engineer' },
    { label: 'Consultant', value: 'Consultant' },
    { label: 'Director', value: 'Director' },
  ],
  department: [
    { label: 'Engineering', value: 'Engineering' },
    { label: 'Product', value: 'Product' },
    { label: 'Design', value: 'Design' },
    { label: 'QA', value: 'QA' },
    { label: 'Data', value: 'Data' },
    { label: 'Operations', value: 'Operations' },
    { label: 'Finance', value: 'Finance' },
    { label: 'HR', value: 'HR' },
    { label: 'Legal', value: 'Legal' },
    { label: 'Executive', value: 'Executive' },
  ],
  venture_type: [
    { label: 'Technology Platform', value: 'Technology Platform' },
    { label: 'Property Platform', value: 'Property Platform' },
    { label: 'Digital Transformation', value: 'Digital Transformation' },
    { label: 'Infrastructure', value: 'Infrastructure' },
    { label: 'Research & Development', value: 'Research & Development' },
    { label: 'Consulting', value: 'Consulting' },
  ],
};

export const configRouter = router({
  listByCategory: protectedProcedure
    .input(z.object({ category: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(configOptions)
        .where(and(eq(configOptions.category, input.category), eq(configOptions.active, true)))
        .orderBy(asc(configOptions.sortOrder), asc(configOptions.label));
    }),

  listAll: protectedProcedure
    .use(requireRole('pmo'))
    .query(async ({ ctx }) => {
      const all = await ctx.db
        .select()
        .from(configOptions)
        .orderBy(asc(configOptions.category), asc(configOptions.sortOrder), asc(configOptions.label));

      const grouped: Record<string, typeof all> = {};
      for (const opt of all) {
        if (!grouped[opt.category]) grouped[opt.category] = [];
        grouped[opt.category].push(opt);
      }
      return grouped;
    }),

  create: protectedProcedure
    .use(requireRole('pmo'))
    .input(z.object({
      category: z.string().min(1).max(50),
      label: z.string().min(1).max(255),
      value: z.string().min(1).max(255),
      sortOrder: z.number().int().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db.insert(configOptions).values({
        category: input.category,
        label: input.label,
        value: input.value,
        sortOrder: input.sortOrder ?? 0,
      }).returning();
      return created;
    }),

  update: protectedProcedure
    .use(requireRole('pmo'))
    .input(z.object({
      id: z.string().uuid(),
      label: z.string().min(1).max(255).optional(),
      value: z.string().min(1).max(255).optional(),
      sortOrder: z.number().int().optional(),
      active: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (updates.label !== undefined) updateData.label = updates.label;
      if (updates.value !== undefined) updateData.value = updates.value;
      if (updates.sortOrder !== undefined) updateData.sortOrder = updates.sortOrder;
      if (updates.active !== undefined) updateData.active = updates.active;

      const [updated] = await ctx.db
        .update(configOptions)
        .set(updateData)
        .where(eq(configOptions.id, id))
        .returning();
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Config option not found' });
      return updated;
    }),

  delete: protectedProcedure
    .use(requireRole('pmo'))
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .delete(configOptions)
        .where(eq(configOptions.id, input.id))
        .returning();
      if (!deleted) throw new TRPCError({ code: 'NOT_FOUND', message: 'Config option not found' });
      return deleted;
    }),

  seed: protectedProcedure
    .use(requireRole('pmo'))
    .mutation(async ({ ctx }) => {
      const existing = await ctx.db.select().from(configOptions);
      const existingCategories = new Set(existing.map(o => o.category));

      let seededCount = 0;
      for (const [category, items] of Object.entries(SEED_DATA)) {
        if (existingCategories.has(category)) continue;
        const values = items.map((item, idx) => ({
          category,
          label: item.label,
          value: item.value,
          sortOrder: idx,
        }));
        await ctx.db.insert(configOptions).values(values);
        seededCount += values.length;
      }
      return { seededCount };
    }),
});
