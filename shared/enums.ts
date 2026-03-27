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

export const RISK_IMPACT = ['low', 'medium', 'high'] as const;
export type RiskImpact = (typeof RISK_IMPACT)[number];

export const RACI_ROLE = ['responsible', 'accountable', 'consulted', 'informed'] as const;
export type RaciRole = (typeof RACI_ROLE)[number];

export const LIKELIHOOD_LABELS: Record<number, string> = {
  1: 'Rare', 2: 'Unlikely', 3: 'Possible', 4: 'Likely', 5: 'Almost Certain',
};

export const IMPACT_LABELS: Record<number, string> = {
  1: 'Negligible', 2: 'Minor', 3: 'Moderate', 4: 'Major', 5: 'Severe',
};

export const SCORE_BANDS = {
  green:   { min: 1,  max: 4,  label: 'Low' },
  yellow:  { min: 5,  max: 8,  label: 'Medium-Low' },
  amber:   { min: 9,  max: 12, label: 'Medium' },
  red:     { min: 13, max: 19, label: 'High' },
  darkRed: { min: 20, max: 25, label: 'Critical' },
} as const;

export type ScoreBand = keyof typeof SCORE_BANDS;

export function getScoreBand(score: number): ScoreBand {
  if (score <= 4) return 'green';
  if (score <= 8) return 'yellow';
  if (score <= 12) return 'amber';
  if (score <= 19) return 'red';
  return 'darkRed';
}

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

/**
 * Derives RAG rating from a numeric risk score (likelihood * impact).
 * Score bands: 1-4 = green, 5-12 = amber, 13-25 = red.
 */
export function deriveRag(likelihood: number, impact: number): RagRating {
  const score = likelihood * impact;
  if (score >= 13) return 'red';
  if (score >= 5) return 'amber';
  return 'green';
}
