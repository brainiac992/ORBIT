CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('created', 'updated', 'deleted', 'escalated', 'resolved', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."blocker_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."budget_category" AS ENUM('people', 'technology', 'vendors', 'other');--> statement-breakpoint
CREATE TYPE "public"."budget_entry_type" AS ENUM('actual', 'committed', 'correction');--> statement-breakpoint
CREATE TYPE "public"."dependency_node_type" AS ENUM('workstream', 'milestone');--> statement-breakpoint
CREATE TYPE "public"."dependency_type" AS ENUM('finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish');--> statement-breakpoint
CREATE TYPE "public"."health_status" AS ENUM('on_track', 'at_risk', 'off_track', 'complete');--> statement-breakpoint
CREATE TYPE "public"."issue_status" AS ENUM('open', 'in_progress', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."milestone_status" AS ENUM('upcoming', 'achieved', 'overdue', 'deferred');--> statement-breakpoint
CREATE TYPE "public"."rag_rating" AS ENUM('green', 'amber', 'red');--> statement-breakpoint
CREATE TYPE "public"."resource_type" AS ENUM('internal', 'external');--> statement-breakpoint
CREATE TYPE "public"."risk_impact" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."risk_probability" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."risk_status" AS ENUM('open', 'mitigated', 'closed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('gm', 'pmo', 'pm');--> statement-breakpoint
CREATE TYPE "public"."venture_status" AS ENUM('planning', 'active', 'on_hold', 'complete', 'archived');--> statement-breakpoint
CREATE TYPE "public"."workstream_status" AS ENUM('not_started', 'in_progress', 'complete', 'on_hold');--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid NOT NULL,
	"venture_id" uuid NOT NULL,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"requested_by" uuid NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_trail" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid NOT NULL,
	"venture_id" uuid,
	"action" "audit_action" NOT NULL,
	"field_name" varchar(100),
	"old_value" text,
	"new_value" text,
	"changed_by" uuid NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blockers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"progress_update_id" uuid,
	"venture_id" uuid NOT NULL,
	"description" text NOT NULL,
	"status" "blocker_status" DEFAULT 'open' NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid
);
--> statement-breakpoint
CREATE TABLE "budget_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venture_id" uuid NOT NULL,
	"entry_type" "budget_entry_type" NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"entry_date" date NOT NULL,
	"category" "budget_category" NOT NULL,
	"description" text NOT NULL,
	"vendor" varchar(255),
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_forecasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venture_id" uuid NOT NULL,
	"forecast_to_complete" numeric(15, 2) NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" varchar(50) NOT NULL,
	"label" varchar(255) NOT NULL,
	"value" varchar(255) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"progress_update_id" uuid NOT NULL,
	"venture_id" uuid NOT NULL,
	"description" text NOT NULL,
	"status" "blocker_status" DEFAULT 'open' NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venture_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"severity" "risk_impact" NOT NULL,
	"impact_description" text,
	"resolution_plan" text,
	"owner" varchar(255),
	"status" "issue_status" DEFAULT 'open' NOT NULL,
	"escalated" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "milestone_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"progress_update_id" uuid NOT NULL,
	"milestone_id" uuid NOT NULL,
	"completed_at" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workstream_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"due_date" date NOT NULL,
	"actual_completion_date" date,
	"status" "milestone_status" DEFAULT 'upcoming' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "progress_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venture_id" uuid NOT NULL,
	"submitted_by" uuid NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"week_label" varchar(20),
	"overall_status" "health_status" NOT NULL,
	"completion_pct" integer NOT NULL,
	"narrative" text NOT NULL,
	"next_actions" text
);
--> statement-breakpoint
CREATE TABLE "resource_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"venture_id" uuid NOT NULL,
	"hours_per_week" numeric(5, 1) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" "resource_type" NOT NULL,
	"role_title" varchar(255),
	"department" varchar(255),
	"company" varchar(255),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venture_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"probability" "risk_probability" NOT NULL,
	"impact" "risk_impact" NOT NULL,
	"rag" "rag_rating" NOT NULL,
	"rag_override" boolean DEFAULT false NOT NULL,
	"mitigation_plan" text,
	"owner" varchar(255),
	"status" "risk_status" DEFAULT 'open' NOT NULL,
	"escalated" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venture_id" uuid NOT NULL,
	"source_type" "dependency_node_type" NOT NULL,
	"source_id" uuid NOT NULL,
	"target_type" "dependency_node_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"dependency_type" "dependency_type" DEFAULT 'finish_to_start' NOT NULL,
	"lag_days" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"azure_oid" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"role" "user_role" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_azure_oid_unique" UNIQUE("azure_oid"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "ventures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"venture_type" varchar(100),
	"pm_user_id" uuid NOT NULL,
	"status" "venture_status" DEFAULT 'planning' NOT NULL,
	"health" "health_status" DEFAULT 'on_track' NOT NULL,
	"start_date" date NOT NULL,
	"target_end_date" date NOT NULL,
	"completion_pct" integer DEFAULT 0 NOT NULL,
	"approved_budget" numeric(15, 2),
	"budget_locked" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workstream_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"progress_update_id" uuid NOT NULL,
	"workstream_id" uuid NOT NULL,
	"status" "workstream_status" NOT NULL,
	"completion_pct" integer NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "workstreams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venture_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"owner_resource_id" uuid,
	"baseline_start" date,
	"baseline_end" date,
	"actual_start" date,
	"actual_end" date,
	"status" "workstream_status" DEFAULT 'not_started' NOT NULL,
	"completion_pct" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_venture_id_ventures_id_fk" FOREIGN KEY ("venture_id") REFERENCES "public"."ventures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_trail" ADD CONSTRAINT "audit_trail_venture_id_ventures_id_fk" FOREIGN KEY ("venture_id") REFERENCES "public"."ventures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_trail" ADD CONSTRAINT "audit_trail_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blockers" ADD CONSTRAINT "blockers_progress_update_id_progress_updates_id_fk" FOREIGN KEY ("progress_update_id") REFERENCES "public"."progress_updates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blockers" ADD CONSTRAINT "blockers_venture_id_ventures_id_fk" FOREIGN KEY ("venture_id") REFERENCES "public"."ventures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blockers" ADD CONSTRAINT "blockers_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_entries" ADD CONSTRAINT "budget_entries_venture_id_ventures_id_fk" FOREIGN KEY ("venture_id") REFERENCES "public"."ventures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_entries" ADD CONSTRAINT "budget_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_forecasts" ADD CONSTRAINT "budget_forecasts_venture_id_ventures_id_fk" FOREIGN KEY ("venture_id") REFERENCES "public"."ventures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_forecasts" ADD CONSTRAINT "budget_forecasts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_progress_update_id_progress_updates_id_fk" FOREIGN KEY ("progress_update_id") REFERENCES "public"."progress_updates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_venture_id_ventures_id_fk" FOREIGN KEY ("venture_id") REFERENCES "public"."ventures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_venture_id_ventures_id_fk" FOREIGN KEY ("venture_id") REFERENCES "public"."ventures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_completions" ADD CONSTRAINT "milestone_completions_progress_update_id_progress_updates_id_fk" FOREIGN KEY ("progress_update_id") REFERENCES "public"."progress_updates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_completions" ADD CONSTRAINT "milestone_completions_milestone_id_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_workstream_id_workstreams_id_fk" FOREIGN KEY ("workstream_id") REFERENCES "public"."workstreams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_updates" ADD CONSTRAINT "progress_updates_venture_id_ventures_id_fk" FOREIGN KEY ("venture_id") REFERENCES "public"."ventures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_updates" ADD CONSTRAINT "progress_updates_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_assignments" ADD CONSTRAINT "resource_assignments_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_assignments" ADD CONSTRAINT "resource_assignments_venture_id_ventures_id_fk" FOREIGN KEY ("venture_id") REFERENCES "public"."ventures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_assignments" ADD CONSTRAINT "resource_assignments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risks" ADD CONSTRAINT "risks_venture_id_ventures_id_fk" FOREIGN KEY ("venture_id") REFERENCES "public"."ventures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risks" ADD CONSTRAINT "risks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_venture_id_ventures_id_fk" FOREIGN KEY ("venture_id") REFERENCES "public"."ventures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventures" ADD CONSTRAINT "ventures_pm_user_id_users_id_fk" FOREIGN KEY ("pm_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventures" ADD CONSTRAINT "ventures_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workstream_updates" ADD CONSTRAINT "workstream_updates_progress_update_id_progress_updates_id_fk" FOREIGN KEY ("progress_update_id") REFERENCES "public"."progress_updates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workstream_updates" ADD CONSTRAINT "workstream_updates_workstream_id_workstreams_id_fk" FOREIGN KEY ("workstream_id") REFERENCES "public"."workstreams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workstreams" ADD CONSTRAINT "workstreams_venture_id_ventures_id_fk" FOREIGN KEY ("venture_id") REFERENCES "public"."ventures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workstreams" ADD CONSTRAINT "workstreams_owner_resource_id_resources_id_fk" FOREIGN KEY ("owner_resource_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approvals_venture_id_idx" ON "approvals" USING btree ("venture_id");--> statement-breakpoint
CREATE INDEX "approvals_status_idx" ON "approvals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_trail" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_venture_id_idx" ON "audit_trail" USING btree ("venture_id");--> statement-breakpoint
CREATE INDEX "audit_changed_at_idx" ON "audit_trail" USING btree ("changed_at");--> statement-breakpoint
CREATE INDEX "blockers_venture_id_idx" ON "blockers" USING btree ("venture_id");--> statement-breakpoint
CREATE INDEX "blockers_status_idx" ON "blockers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "budget_entries_venture_id_idx" ON "budget_entries" USING btree ("venture_id");--> statement-breakpoint
CREATE INDEX "budget_forecasts_venture_id_idx" ON "budget_forecasts" USING btree ("venture_id");--> statement-breakpoint
CREATE INDEX "config_options_category_active_idx" ON "config_options" USING btree ("category","active");--> statement-breakpoint
CREATE INDEX "decisions_venture_id_idx" ON "decisions" USING btree ("venture_id");--> statement-breakpoint
CREATE INDEX "decisions_status_idx" ON "decisions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "issues_venture_id_idx" ON "issues" USING btree ("venture_id");--> statement-breakpoint
CREATE INDEX "issues_escalated_idx" ON "issues" USING btree ("escalated");--> statement-breakpoint
CREATE INDEX "issues_status_idx" ON "issues" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ms_completions_progress_id_idx" ON "milestone_completions" USING btree ("progress_update_id");--> statement-breakpoint
CREATE INDEX "ms_completions_milestone_id_idx" ON "milestone_completions" USING btree ("milestone_id");--> statement-breakpoint
CREATE INDEX "milestones_workstream_id_idx" ON "milestones" USING btree ("workstream_id");--> statement-breakpoint
CREATE INDEX "progress_venture_id_idx" ON "progress_updates" USING btree ("venture_id");--> statement-breakpoint
CREATE INDEX "assignments_resource_id_idx" ON "resource_assignments" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "assignments_venture_id_idx" ON "resource_assignments" USING btree ("venture_id");--> statement-breakpoint
CREATE INDEX "risks_venture_id_idx" ON "risks" USING btree ("venture_id");--> statement-breakpoint
CREATE INDEX "risks_escalated_idx" ON "risks" USING btree ("escalated");--> statement-breakpoint
CREATE INDEX "risks_status_idx" ON "risks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "task_deps_venture_id_idx" ON "task_dependencies" USING btree ("venture_id");--> statement-breakpoint
CREATE INDEX "task_deps_source_idx" ON "task_dependencies" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "task_deps_target_idx" ON "task_dependencies" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "ventures_pm_user_id_idx" ON "ventures" USING btree ("pm_user_id");--> statement-breakpoint
CREATE INDEX "ventures_status_idx" ON "ventures" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ws_updates_progress_id_idx" ON "workstream_updates" USING btree ("progress_update_id");--> statement-breakpoint
CREATE INDEX "ws_updates_workstream_id_idx" ON "workstream_updates" USING btree ("workstream_id");--> statement-breakpoint
CREATE INDEX "workstreams_venture_id_idx" ON "workstreams" USING btree ("venture_id");