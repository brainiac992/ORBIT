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
  uniqueIndex,
  jsonb,
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
export const riskImpactEnum = pgEnum('risk_impact', ['low', 'medium', 'high', 'blocker']);
export const raciRoleEnum = pgEnum('raci_role', ['responsible', 'accountable', 'consulted', 'informed']);
export const ragRatingEnum = pgEnum('rag_rating', ['green', 'amber', 'red']);
export const riskStatusEnum = pgEnum('risk_status', ['open', 'mitigated', 'closed']);
export const issueStatusEnum = pgEnum('issue_status', ['open', 'in_progress', 'resolved']);
export const blockerStatusEnum = pgEnum('blocker_status', ['open', 'resolved']);
export const dependencyNodeTypeEnum = pgEnum('dependency_node_type', ['workstream', 'milestone']);
export const dependencyTypeEnum = pgEnum('dependency_type', ['finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish']);
export const auditActionEnum = pgEnum('audit_action', ['created', 'updated', 'deleted', 'escalated', 'resolved', 'approved', 'rejected']);
export const approvalStatusEnum = pgEnum('approval_status', ['pending', 'approved', 'rejected']);

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
  setupStep: integer('setup_step').default(0).notNull(),
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
}, (table) => [
  index('ws_updates_progress_id_idx').on(table.progressUpdateId),
  index('ws_updates_workstream_id_idx').on(table.workstreamId),
]);

// ── Milestone Completions (child of progress update) ───────

export const milestoneCompletions = pgTable('milestone_completions', {
  id: uuid('id').primaryKey().defaultRandom(),
  progressUpdateId: uuid('progress_update_id').references(() => progressUpdates.id).notNull(),
  milestoneId: uuid('milestone_id').references(() => milestones.id).notNull(),
  completedAt: date('completed_at').notNull(),
}, (table) => [
  index('ms_completions_progress_id_idx').on(table.progressUpdateId),
  index('ms_completions_milestone_id_idx').on(table.milestoneId),
]);

// ── Blockers ───────────────────────────────────────────────

export const blockers = pgTable('blockers', {
  id: uuid('id').primaryKey().defaultRandom(),
  progressUpdateId: uuid('progress_update_id').references(() => progressUpdates.id),
  ventureId: uuid('venture_id').references(() => ventures.id).notNull(),
  description: text('description').notNull(),
  status: blockerStatusEnum('status').default('open').notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedBy: uuid('resolved_by').references(() => users.id),
}, (table) => [
  index('blockers_venture_id_idx').on(table.ventureId),
  index('blockers_status_idx').on(table.status),
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
  index('decisions_status_idx').on(table.status),
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
  likelihood: integer('likelihood').notNull(),                // 1-5
  impact: integer('impact').notNull(),                        // 1-5
  riskScore: integer('risk_score').notNull(),                  // 1-25, persisted
  weight: integer('weight').notNull().default(3),              // 1-5
  rag: ragRatingEnum('rag').notNull(),
  ragOverride: boolean('rag_override').default(false).notNull(),
  mitigationPlan: text('mitigation_plan'),
  ownerResourceId: uuid('owner_resource_id').references(() => resources.id),
  escalationPath: text('escalation_path'),
  legacyOwnerText: varchar('legacy_owner_text', { length: 255 }),
  status: riskStatusEnum('status').default('open').notNull(),
  escalated: boolean('escalated').default(false).notNull(),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('risks_venture_id_idx').on(table.ventureId),
  index('risks_escalated_idx').on(table.escalated),
  index('risks_status_idx').on(table.status),
  index('risks_risk_score_idx').on(table.riskScore),
  index('risks_owner_resource_id_idx').on(table.ownerResourceId),
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
  index('issues_status_idx').on(table.status),
]);

// ── Task Dependencies ─────────────────────────────────────

export const taskDependencies = pgTable('task_dependencies', {
  id: uuid('id').primaryKey().defaultRandom(),
  ventureId: uuid('venture_id').references(() => ventures.id).notNull(),
  sourceType: dependencyNodeTypeEnum('source_type').notNull(),
  sourceId: uuid('source_id').notNull(),
  targetType: dependencyNodeTypeEnum('target_type').notNull(),
  targetId: uuid('target_id').notNull(),
  dependencyType: dependencyTypeEnum('dependency_type').default('finish_to_start').notNull(),
  lagDays: integer('lag_days').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('task_deps_venture_id_idx').on(table.ventureId),
  index('task_deps_source_idx').on(table.sourceType, table.sourceId),
  index('task_deps_target_idx').on(table.targetType, table.targetId),
]);

// ── Audit Trail ───────────────────────────────────────────

export const auditTrail = pgTable('audit_trail', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId: uuid('entity_id').notNull(),
  ventureId: uuid('venture_id').references(() => ventures.id),
  action: auditActionEnum('action').notNull(),
  fieldName: varchar('field_name', { length: 100 }),
  oldValue: text('old_value'),
  newValue: text('new_value'),
  changedBy: uuid('changed_by').references(() => users.id).notNull(),
  changedAt: timestamp('changed_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('audit_entity_idx').on(table.entityType, table.entityId),
  index('audit_venture_id_idx').on(table.ventureId),
  index('audit_changed_at_idx').on(table.changedAt),
]);

// ── Config Options ────────────────────────────────────────

export const configOptions = pgTable('config_options', {
  id: uuid('id').primaryKey().defaultRandom(),
  category: varchar('category', { length: 50 }).notNull(),
  label: varchar('label', { length: 255 }).notNull(),
  value: varchar('value', { length: 255 }).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('config_options_category_active_idx').on(table.category, table.active),
]);

// ── Approvals ─────────────────────────────────────────────

export const approvals = pgTable('approvals', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityId: uuid('entity_id').notNull(),
  ventureId: uuid('venture_id').references(() => ventures.id).notNull(),
  status: approvalStatusEnum('status').default('pending').notNull(),
  requestedBy: uuid('requested_by').references(() => users.id).notNull(),
  decidedBy: uuid('decided_by').references(() => users.id),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('approvals_venture_id_idx').on(table.ventureId),
  index('approvals_status_idx').on(table.status),
]);

// ── Workstream RACI Assignments ──────────────────────────

export const workstreamRaciAssignments = pgTable('workstream_raci_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  workstreamId: uuid('workstream_id').references(() => workstreams.id, { onDelete: 'cascade' }).notNull(),
  resourceId: uuid('resource_id').references(() => resources.id, { onDelete: 'cascade' }).notNull(),
  raciRole: raciRoleEnum('raci_role').notNull(),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('raci_workstream_id_idx').on(table.workstreamId),
  index('raci_resource_id_idx').on(table.resourceId),
  uniqueIndex('raci_ws_resource_role_idx').on(table.workstreamId, table.resourceId, table.raciRole),
]);

// ── Venture Plans (AI-generated) ─────────────────────────

export const planModeEnum = pgEnum('plan_mode', ['comfort', 'tight', 'stretch']);
export const artifactStageEnum = pgEnum('artifact_stage', ['initiation', 'planning', 'execution', 'monitoring', 'closure']);

export const venturePlans = pgTable('venture_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  ventureId: uuid('venture_id').references(() => ventures.id).notNull(),
  mode: planModeEnum('mode').notNull(),
  summary: text('summary').notNull(),
  payload: jsonb('payload').notNull(),  // full plan JSON: milestones, schedule, resource alloc, budget dist
  selected: boolean('selected').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('venture_plans_venture_id_idx').on(table.ventureId),
]);

// ── Artifacts (project documents) ────────────────────────

export const artifacts = pgTable('artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  ventureId: uuid('venture_id').references(() => ventures.id).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  stage: artifactStageEnum('stage').notNull(),
  fileName: varchar('file_name', { length: 500 }).notNull(),
  fileSize: integer('file_size'),
  mimeType: varchar('mime_type', { length: 255 }),
  s3Key: varchar('s3_key', { length: 1000 }),
  uploadedBy: uuid('uploaded_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('artifacts_venture_id_idx').on(table.ventureId),
  index('artifacts_stage_idx').on(table.stage),
]);
