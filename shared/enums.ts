// Single source of truth for all status enums used across DB, API, and frontend

export const VENTURE_STATUS = ['planning', 'active', 'on_hold', 'complete', 'archived'] as const;
export type VentureStatus = (typeof VENTURE_STATUS)[number];

export const HEALTH_STATUS = ['on_track', 'at_risk', 'off_track', 'complete'] as const;
export type HealthStatus = (typeof HEALTH_STATUS)[number];

export const WORKSTREAM_STATUS = ['not_started', 'in_progress', 'complete', 'on_hold'] as const;
export type WorkstreamStatus = (typeof WORKSTREAM_STATUS)[number];

export const MILESTONE_STATUS = ['upcoming', 'achieved', 'overdue', 'deferred'] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUS)[number];

export const RESOURCE_TYPE = ['internal', 'external'] as const;
export type ResourceType = (typeof RESOURCE_TYPE)[number];

export const BUDGET_CATEGORY = ['people', 'technology', 'vendors', 'other'] as const;
export type BudgetCategory = (typeof BUDGET_CATEGORY)[number];

export const BUDGET_ENTRY_TYPE = ['actual', 'committed', 'correction'] as const;
export type BudgetEntryType = (typeof BUDGET_ENTRY_TYPE)[number];

export const BUDGET_STATUS = ['within_budget', 'at_risk', 'over_budget'] as const;
export type BudgetStatus = (typeof BUDGET_STATUS)[number];

export const RISK_PROBABILITY = ['low', 'medium', 'high'] as const;
export type RiskProbability = (typeof RISK_PROBABILITY)[number];

export const RISK_IMPACT = ['low', 'medium', 'high'] as const;
export type RiskImpact = (typeof RISK_IMPACT)[number];

export const RAG_RATING = ['green', 'amber', 'red'] as const;
export type RagRating = (typeof RAG_RATING)[number];

export const RISK_STATUS = ['open', 'mitigated', 'closed'] as const;
export type RiskStatus = (typeof RISK_STATUS)[number];

export const ISSUE_STATUS = ['open', 'in_progress', 'resolved'] as const;
export type IssueStatus = (typeof ISSUE_STATUS)[number];

export const BLOCKER_STATUS = ['open', 'resolved'] as const;
export type BlockerStatus = (typeof BLOCKER_STATUS)[number];

export const USER_ROLE = ['gm', 'pmo', 'pm'] as const;
export type UserRole = (typeof USER_ROLE)[number];

export const DEPENDENCY_NODE_TYPE = ['workstream', 'milestone'] as const;
export type DependencyNodeType = (typeof DEPENDENCY_NODE_TYPE)[number];

export const DEPENDENCY_TYPE = ['finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish'] as const;
export type DependencyType = (typeof DEPENDENCY_TYPE)[number];

export const AUDIT_ACTION = ['created', 'updated', 'deleted', 'escalated', 'resolved', 'approved', 'rejected'] as const;
export type AuditAction = (typeof AUDIT_ACTION)[number];

export const APPROVAL_STATUS = ['pending', 'approved', 'rejected'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUS)[number];

export function deriveRag(probability: RiskProbability, impact: RiskImpact): RagRating {
  if (probability === 'high' && impact === 'high') return 'red';
  if (probability === 'high' || impact === 'high') return 'amber';
  if (probability === 'medium' && impact === 'medium') return 'amber';
  return 'green';
}
