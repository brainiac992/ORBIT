import { z } from 'zod';
import { router, protectedProcedure, requireRole } from '../trpc.js';
import { ventures, venturePlans, workstreams, milestones, resources, resourceAssignments, workstreamRaciAssignments, risks, issues, budgetEntries } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import Anthropic from '@anthropic-ai/sdk';

const STEP_LABELS = ['resources', 'workstreams', 'raci', 'risks', 'budget', 'ai_plan'] as const;

export const wizardRouter = router({
  // Get current wizard state for a venture
  state: protectedProcedure
    .input(z.object({ ventureId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [venture] = await ctx.db
        .select()
        .from(ventures)
        .where(eq(ventures.id, input.ventureId))
        .limit(1);

      if (!venture) throw new TRPCError({ code: 'NOT_FOUND' });

      // Gather counts for each step
      const [resCnt] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(resourceAssignments)
        .where(eq(resourceAssignments.ventureId, input.ventureId));

      const [wsCnt] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(workstreams)
        .where(eq(workstreams.ventureId, input.ventureId));

      const wsRows = await ctx.db
        .select({ id: workstreams.id })
        .from(workstreams)
        .where(eq(workstreams.ventureId, input.ventureId));
      const wsIds = wsRows.map(w => w.id);

      let raciCnt = 0;
      if (wsIds.length > 0) {
        const [r] = await ctx.db
          .select({ count: sql<number>`count(*)::int` })
          .from(workstreamRaciAssignments)
          .where(sql`${workstreamRaciAssignments.workstreamId} = ANY(${wsIds})`);
        raciCnt = r.count;
      }

      const [riskCnt] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(risks)
        .where(eq(risks.ventureId, input.ventureId));

      const hasBudget = venture.approvedBudget && Number(venture.approvedBudget) > 0;

      return {
        setupStep: venture.setupStep,
        complete: venture.setupStep >= 6,
        steps: [
          { key: 'resources', label: 'Resources', done: resCnt.count > 0, count: resCnt.count },
          { key: 'workstreams', label: 'Workstreams', done: wsCnt.count > 0, count: wsCnt.count },
          { key: 'raci', label: 'RACI', done: raciCnt > 0, count: raciCnt },
          { key: 'risks', label: 'Risks & Issues', done: true, count: riskCnt.count }, // advisory, always passable
          { key: 'budget', label: 'Budget', done: !!hasBudget, count: hasBudget ? 1 : 0 },
          { key: 'ai_plan', label: 'AI Project Plan', done: venture.setupStep >= 6, count: 0 },
        ],
      };
    }),

  // Advance to next step (validates current step is complete)
  advanceStep: protectedProcedure
    .use(requireRole('pm', 'pmo'))
    .input(z.object({ ventureId: z.string().uuid(), toStep: z.number().int().min(1).max(6) }))
    .mutation(async ({ ctx, input }) => {
      const [venture] = await ctx.db
        .select()
        .from(ventures)
        .where(eq(ventures.id, input.ventureId))
        .limit(1);

      if (!venture) throw new TRPCError({ code: 'NOT_FOUND' });

      // Validate the step they're advancing FROM
      const fromStep = input.toStep - 1;

      if (fromStep >= 1) {
        // Step 1: resources
        const [resCnt] = await ctx.db
          .select({ count: sql<number>`count(*)::int` })
          .from(resourceAssignments)
          .where(eq(resourceAssignments.ventureId, input.ventureId));
        if (resCnt.count === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Add at least one resource before proceeding.' });
      }
      if (fromStep >= 2) {
        const [wsCnt] = await ctx.db
          .select({ count: sql<number>`count(*)::int` })
          .from(workstreams)
          .where(eq(workstreams.ventureId, input.ventureId));
        if (wsCnt.count === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Add at least one workstream before proceeding.' });
      }
      if (fromStep >= 3) {
        const wsRows = await ctx.db
          .select({ id: workstreams.id })
          .from(workstreams)
          .where(eq(workstreams.ventureId, input.ventureId));
        const wsIds = wsRows.map(w => w.id);
        if (wsIds.length > 0) {
          const [raciCnt] = await ctx.db
            .select({ count: sql<number>`count(*)::int` })
            .from(workstreamRaciAssignments)
            .where(sql`${workstreamRaciAssignments.workstreamId} = ANY(${wsIds})`);
          if (raciCnt.count === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Add at least one RACI assignment before proceeding.' });
        }
      }
      // Step 4 (risks) is advisory — always passable
      if (fromStep >= 5) {
        if (!venture.approvedBudget || Number(venture.approvedBudget) <= 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Set the approved budget before proceeding.' });
        }
      }

      const newStep = Math.max(venture.setupStep, input.toStep);
      await ctx.db.update(ventures)
        .set({ setupStep: newStep, updatedAt: new Date() })
        .where(eq(ventures.id, input.ventureId));

      return { setupStep: newStep };
    }),

  // Generate AI plans
  generatePlans: protectedProcedure
    .use(requireRole('pm', 'pmo'))
    .input(z.object({ ventureId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [venture] = await ctx.db
        .select()
        .from(ventures)
        .where(eq(ventures.id, input.ventureId))
        .limit(1);

      if (!venture) throw new TRPCError({ code: 'NOT_FOUND' });

      // Gather all venture data
      const wsRows = await ctx.db.select().from(workstreams).where(eq(workstreams.ventureId, input.ventureId));
      const resAssignments = await ctx.db.select().from(resourceAssignments).where(eq(resourceAssignments.ventureId, input.ventureId));
      const resIds = [...new Set(resAssignments.map(r => r.resourceId))];
      let resRows: any[] = [];
      if (resIds.length > 0) {
        resRows = await ctx.db.select().from(resources).where(sql`${resources.id} = ANY(${resIds})`);
      }

      const wsIds = wsRows.map(w => w.id);
      let raciRows: any[] = [];
      if (wsIds.length > 0) {
        raciRows = await ctx.db.select().from(workstreamRaciAssignments).where(sql`${workstreamRaciAssignments.workstreamId} = ANY(${wsIds})`);
      }

      const riskRows = await ctx.db.select().from(risks).where(eq(risks.ventureId, input.ventureId));
      const issueRows = await ctx.db.select().from(issues).where(eq(issues.ventureId, input.ventureId));

      const [budgetData] = await ctx.db
        .select({ total: sql<string>`COALESCE(SUM(amount::numeric), 0)::text` })
        .from(budgetEntries)
        .where(eq(budgetEntries.ventureId, input.ventureId));

      const projectContext = {
        venture: {
          name: venture.name,
          description: venture.description,
          type: venture.ventureType,
          startDate: venture.startDate,
          targetEndDate: venture.targetEndDate,
          approvedBudget: venture.approvedBudget,
        },
        workstreams: wsRows.map(ws => ({
          name: ws.name,
          baselineStart: ws.baselineStart,
          baselineEnd: ws.baselineEnd,
          status: ws.status,
        })),
        resources: resRows.map(r => ({
          name: r.name,
          type: r.type,
          roleTitle: r.roleTitle,
        })),
        resourceAssignments: resAssignments.map(ra => ({
          resourceId: ra.resourceId,
          hoursPerWeek: ra.hoursPerWeek,
          startDate: ra.startDate,
          endDate: ra.endDate,
        })),
        raciAssignments: raciRows.length,
        risks: riskRows.map(r => ({
          title: r.title,
          likelihood: r.likelihood,
          impact: r.impact,
          riskScore: r.riskScore,
        })),
        issues: issueRows.map(i => ({
          title: i.title,
          severity: i.severity,
        })),
        budgetSpent: budgetData.total,
      };

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI service not configured. Set ANTHROPIC_API_KEY.' });

      const anthropic = new Anthropic({ apiKey });

      const prompt = `You are a project management AI. Given the following project data, generate THREE project plans: "comfort" (generous timelines with buffer), "tight" (optimal with minimal slack), and "stretch" (aggressive, compressed timelines).

PROJECT DATA:
${JSON.stringify(projectContext, null, 2)}

For EACH plan mode (comfort, tight, stretch), provide:
1. A short summary (2-3 sentences) describing the approach
2. For each workstream, provide:
   - Recommended start date (YYYY-MM-DD)
   - Recommended end date (YYYY-MM-DD)
   - Key milestones with names and due dates
3. Resource allocation recommendations (hours per week per resource)
4. Budget distribution across categories (people, technology, vendors, other) as percentages
5. Key assumptions and risks specific to this plan mode

IMPORTANT: Dates must be between ${venture.startDate} and a reasonable end date. The approved budget is ${venture.approvedBudget} AED.

Respond in this exact JSON format (no markdown, no code fences, just raw JSON):
{
  "plans": [
    {
      "mode": "comfort",
      "summary": "...",
      "workstreams": [
        {
          "name": "workstream name (must match exactly)",
          "startDate": "YYYY-MM-DD",
          "endDate": "YYYY-MM-DD",
          "milestones": [{ "name": "...", "dueDate": "YYYY-MM-DD" }]
        }
      ],
      "resourceAllocations": [
        { "resourceName": "...", "hoursPerWeek": 0 }
      ],
      "budgetDistribution": { "people": 0, "technology": 0, "vendors": 0, "other": 0 },
      "assumptions": ["..."],
      "risks": ["..."]
    },
    { "mode": "tight", ... },
    { "mode": "stretch", ... }
  ]
}`;

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      });

      const textBlock = response.content.find(b => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI returned no text response.' });
      }

      let parsed: any;
      try {
        parsed = JSON.parse(textBlock.text);
      } catch {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'AI returned invalid JSON.' });
      }

      // Clear any previous plans for this venture
      await ctx.db.delete(venturePlans).where(eq(venturePlans.ventureId, input.ventureId));

      // Store all 3 plans
      const stored = [];
      for (const plan of parsed.plans) {
        const [row] = await ctx.db.insert(venturePlans).values({
          ventureId: input.ventureId,
          mode: plan.mode,
          summary: plan.summary,
          payload: plan,
          selected: false,
        }).returning();
        stored.push(row);
      }

      return { plans: stored };
    }),

  // List generated plans
  listPlans: protectedProcedure
    .input(z.object({ ventureId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(venturePlans)
        .where(eq(venturePlans.ventureId, input.ventureId));
    }),

  // Select a plan — populates venture data
  selectPlan: protectedProcedure
    .use(requireRole('pm', 'pmo'))
    .input(z.object({ ventureId: z.string().uuid(), planId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [plan] = await ctx.db
        .select()
        .from(venturePlans)
        .where(and(eq(venturePlans.id, input.planId), eq(venturePlans.ventureId, input.ventureId)))
        .limit(1);

      if (!plan) throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan not found.' });

      const payload = plan.payload as any;

      // Mark this plan as selected, others as not
      await ctx.db.update(venturePlans)
        .set({ selected: false })
        .where(eq(venturePlans.ventureId, input.ventureId));
      await ctx.db.update(venturePlans)
        .set({ selected: true })
        .where(eq(venturePlans.id, input.planId));

      // Apply plan to workstreams and milestones
      const wsRows = await ctx.db.select().from(workstreams).where(eq(workstreams.ventureId, input.ventureId));

      for (const wsPlan of payload.workstreams ?? []) {
        const match = wsRows.find(ws => ws.name === wsPlan.name);
        if (!match) continue;

        // Update workstream dates
        await ctx.db.update(workstreams)
          .set({
            baselineStart: wsPlan.startDate,
            baselineEnd: wsPlan.endDate,
            updatedAt: new Date(),
          })
          .where(eq(workstreams.id, match.id));

        // Insert milestones
        if (wsPlan.milestones?.length) {
          for (const ms of wsPlan.milestones) {
            await ctx.db.insert(milestones).values({
              workstreamId: match.id,
              name: ms.name,
              dueDate: ms.dueDate,
              status: 'upcoming',
            });
          }
        }
      }

      // Update resource allocations if provided
      if (payload.resourceAllocations?.length) {
        const allRes = await ctx.db.select().from(resources);
        const assignments = await ctx.db.select().from(resourceAssignments).where(eq(resourceAssignments.ventureId, input.ventureId));

        for (const alloc of payload.resourceAllocations) {
          const res = allRes.find(r => r.name === alloc.resourceName);
          if (!res) continue;
          const existing = assignments.find(a => a.resourceId === res.id);
          if (existing) {
            await ctx.db.update(resourceAssignments)
              .set({ hoursPerWeek: String(alloc.hoursPerWeek) })
              .where(eq(resourceAssignments.id, existing.id));
          }
        }
      }

      // Mark venture as setup complete
      await ctx.db.update(ventures)
        .set({ setupStep: 6, status: 'active', updatedAt: new Date() })
        .where(eq(ventures.id, input.ventureId));

      return { success: true, mode: plan.mode };
    }),
});
