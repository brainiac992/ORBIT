import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  numeric,
  date,
  timestamp,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';

// ── Enums ──────────────────────────────────────────────────

export const userRoleEnum = pgEnum('user_role', ['gm', 'pmo', 'pm']);
export const ventureStatusEnum = pgEnum('venture_status', ['planning', 'active', 'on_hold', 'complete', 'archived']);
export const healthStatusEnum = pgEnum('health_status', ['on_track', 'at_risk', 'off_track', 'complete']);
export const workstreamStatusEnum = pgEnum('workstream_status', ['not_started', 'in_progress', 'complete', 'on_hold']);
export const milestoneStatusEnum = pgEnum('milestone_status', ['upcoming', 'achieved', 'overdue', 'deferred']);
export const resourceTypeEnum = pgEnum('resource_type', ['internal', 'external']);
export const budgetCategoryEnum = pgEnum('budget_category', ['people', 'technology', 'vendors', 'other']);
export const budgetEntryTypeEnum = pgEnum('budget_entry_type', ['actual', 'committed', 'correction']);
export const riskProbabilityEnum = pgEnum('risk_probability', ['low', 'medium', 'high']);
export const riskImpactEnum = pgEnum('risk_impact', ['low', 'medium', 'high']);
export const ragRatingEnum = pgEnum('rag_rating', ['green', 'amber', 'red']);
export const riskStatusEnum = pgEnum('risk_status', ['open', 'mitigated', 'closed']);
export const issueStatusEnum = pgEnum('issue_status', ['open', 'in_progress', 'resolved']);
export const blockerStatusEnum = pgEnum('blocker_status', ['open', 'resolved']);

// ── Users ──────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  azureOid: varchar('azure_oid', { length: 255 }).unique().notNull(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  role: userRoleEnum('role').notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Ventures ───────────────────────────────────────────────

export const ventures = pgTable('ventures', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  ventureType: varchar('venture_type', { length: 100 }),
  pmUserId: uuid('pm_user_id').references(() => users.id).notNull(),
  status: ventureStatusEnum('status').default('planning').notNull(),
  health: healthStatusEnum('health').default('on_track').notNull(),
  startDate: date('start_date').notNull(),
  targetEndDate: date('target_end_date').notNull(),
  completionPct: integer('completion_pct').default(0).notNull(),
  approvedBudget: numeric('approved_budget', { precision: 15, scale: 2 }),
  budgetLocked: boolean('budget_locked').default(false).notNull(),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('ventures_pm_user_id_idx').on(table.pmUserId),
  index('ventures_status_idx').on(table.status),
]);

// ── Workstreams ────────────────────────────────────────────

export const workstreams = pgTable('workstreams', {
  id: uuid('id').primaryKey().defaultRandom(),
  ventureId: uuid('venture_id').references(() => ventures.id).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  ownerResourceId: uuid('owner_resource_id').references(() => resources.id),
  baselineStart: date('baseline_start'),
  baselineEnd: date('baseline_end'),
  actualStart: date('actual_start'),
  actualEnd: date('actual_end'),
  status: workstreamStatusEnum('status').default('not_started').notNull(),
  completionPct: integer('completion_pct').default(0).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('workstreams_venture_id_idx').on(table.ventureId),
]);

// ── Milestones ─────────────────────────────────────────────

export const milestones = pgTable('milestones', {
  id: uuid('id').primaryKey().defaultRandom(),
  workstreamId: uuid('workstream_id').references(() => workstreams.id).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  dueDate: date('due_date').notNull(),
  actualCompletionDate: date('actual_completion_date'),
  status: milestoneStatusEnum('status').default('upcoming').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('milestones_workstream_id_idx').on(table.workstreamId),
]);

// ── Resources ──────────────────────────────────────────────

export const resources = pgTable('resources', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  type: resourceTypeEnum('type').notNull(),
  roleTitle: varchar('role_title', { length: 255 }),
  department: varchar('department', { length: 255 }),
  company: varchar('company', { length: 255 }),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Resource Assignments ───────────────────────────────────

export const resourceAssignments = pgTable('resource_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  resourceId: uuid('resource_id').references(() => resources.id).notNull(),
  ventureId: uuid('venture_id').references(() => ventures.id).notNull(),
  hoursPerWeek: numeric('hours_per_week', { precision: 5, scale: 1 }).notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date'),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('assignments_resource_id_idx').on(table.resourceId),
  index('assignments_venture_id_idx').on(table.ventureId),
]);

// ── Progress Updates (immutable — insert only) ─────────────

export const progressUpdates = pgTable('progress_updates', {
  id: uuid('id').primaryKey().defaultRandom(),
  ventureId: uuid('venture_id').references(() => ventures.id).notNull(),
  submittedBy: uuid('submitted_by').references(() => users.id).notNull(),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
  weekLabel: varchar('week_label', { length: 20 }),
  overallStatus: healthStatusEnum('overall_status').notNull(),
  completionPct: integer('completion_pct').notNull(),
  narrative: text('narrative').notNull(),
  nextActions: text('next_actions'),
}, (table) => [
  index('progress_venture_id_idx').on(table.ventureId),
]);

// ── Workstream Updates (child of progress update) ──────────

export const workstreamUpdates = pgTable('workstream_updates', {
  id: uuid('id').primaryKey().defaultRandom(),
  progressUpdateId: uuid('progress_update_id').references(() => progressUpdates.id).notNull(),
  workstreamId: uuid('workstream_id').references(() => workstreams.id).notNull(),
  status: workstreamStatusEnum('status').notNull(),
  completionPct: integer('completion_pct').notNull(),
  notes: text('notes'),
});

// ── Milestone Completions (child of progress update) ───────

export const milestoneCompletions = pgTable('milestone_completions', {
  id: uuid('id').primaryKey().defaultRandom(),
  progressUpdateId: uuid('progress_update_id').references(() => progressUpdates.id).notNull(),
  milestoneId: uuid('milestone_id').references(() => milestones.id).notNull(),
  completedAt: date('completed_at').notNull(),
});

// ── Blockers ───────────────────────────────────────────────

export const blockers = pgTable('blockers', {
  id: uuid('id').primaryKey().defaultRandom(),
  progressUpdateId: uuid('progress_update_id').references(() => progressUpdates.id).notNull(),
  ventureId: uuid('venture_id').references(() => ventures.id).notNull(),
  description: text('description').notNull(),
  status: blockerStatusEnum('status').default('open').notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedBy: uuid('resolved_by').references(() => users.id),
}, (table) => [
  index('blockers_venture_id_idx').on(table.ventureId),
]);

// ── Decisions ──────────────────────────────────────────────

export const decisions = pgTable('decisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  progressUpdateId: uuid('progress_update_id').references(() => progressUpdates.id).notNull(),
  ventureId: uuid('venture_id').references(() => ventures.id).notNull(),
  description: text('description').notNull(),
  status: blockerStatusEnum('status').default('open').notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedBy: uuid('resolved_by').references(() => users.id),
}, (table) => [
  index('decisions_venture_id_idx').on(table.ventureId),
]);

// ── Budget Entries (immutable — insert only) ───────────────

export const budgetEntries = pgTable('budget_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  ventureId: uuid('venture_id').references(() => ventures.id).notNull(),
  entryType: budgetEntryTypeEnum('entry_type').notNull(),
  amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
  entryDate: date('entry_date').notNull(),
  category: budgetCategoryEnum('category').notNull(),
  description: text('description').notNull(),
  vendor: varchar('vendor', { length: 255 }),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('budget_entries_venture_id_idx').on(table.ventureId),
]);

// ── Budget Forecasts (append-only — latest per venture is active) ──

export const budgetForecasts = pgTable('budget_forecasts', {
  id: uuid('id').primaryKey().defaultRandom(),
  ventureId: uuid('venture_id').references(() => ventures.id).notNull(),
  forecastToComplete: numeric('forecast_to_complete', { precision: 15, scale: 2 }).notNull(),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('budget_forecasts_venture_id_idx').on(table.ventureId),
]);

// ── Risks ──────────────────────────────────────────────────

export const risks = pgTable('risks', {
  id: uuid('id').primaryKey().defaultRandom(),
  ventureId: uuid('venture_id').references(() => ventures.id).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  probability: riskProbabilityEnum('probability').notNull(),
  impact: riskImpactEnum('impact').notNull(),
  rag: ragRatingEnum('rag').notNull(),
  ragOverride: boolean('rag_override').default(false).notNull(),
  mitigationPlan: text('mitigation_plan'),
  owner: varchar('owner', { length: 255 }),
  status: riskStatusEnum('status').default('open').notNull(),
  escalated: boolean('escalated').default(false).notNull(),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('risks_venture_id_idx').on(table.ventureId),
  index('risks_escalated_idx').on(table.escalated),
]);

// ── Issues ─────────────────────────────────────────────────

export const issues = pgTable('issues', {
  id: uuid('id').primaryKey().defaultRandom(),
  ventureId: uuid('venture_id').references(() => ventures.id).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  severity: riskImpactEnum('severity').notNull(),
  impactDescription: text('impact_description'),
  resolutionPlan: text('resolution_plan'),
  owner: varchar('owner', { length: 255 }),
  status: issueStatusEnum('status').default('open').notNull(),
  escalated: boolean('escalated').default(false).notNull(),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('issues_venture_id_idx').on(table.ventureId),
  index('issues_escalated_idx').on(table.escalated),
]);
