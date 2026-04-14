/**
 * Pure mapping functions: Jira API response shapes → ORBIT DB insert shapes.
 * No I/O, no side effects. All functions are synchronous.
 */

import { createHash } from 'crypto';
import type { JiraIssue, JiraComment, JiraProject } from './jiraClient.js';

// ── Status mapping ─────────────────────────────────────────────

const DEFAULT_STATUS_MAP: Record<string, string> = {
  // Not started
  'To Do': 'not_started',
  'Backlog': 'not_started',
  'Open': 'not_started',
  'New': 'not_started',
  'Reopened': 'not_started',
  'Selected for Development': 'not_started',
  // In progress
  'In Progress': 'in_progress',
  'In Development': 'in_progress',
  'In Review': 'in_progress',
  'In QA': 'in_progress',
  'Code Review': 'in_progress',
  'Review': 'in_progress',
  'Testing': 'in_progress',
  'QA': 'in_progress',
  'Under Review': 'in_progress',
  'Waiting for Review': 'in_progress',
  'Active': 'in_progress',
  // Complete
  'Done': 'complete',
  'Closed': 'complete',
  'Resolved': 'complete',
  'Released': 'complete',
  'Release': 'complete',
  'Completed': 'complete',
};

/**
 * Maps a Jira status name to an ORBIT status string.
 * Applies custom mappings first, then default table, then falls back to 'on_hold'.
 * Returns the ORBIT status and whether it was an unmapped (warning) case.
 */
export function mapJiraStatus(
  jiraStatus: string,
  customMappings: Record<string, string> = {},
): { status: string; wasUnmapped: boolean } {
  // Check custom mappings first (exact match)
  if (customMappings[jiraStatus]) {
    return { status: customMappings[jiraStatus], wasUnmapped: false };
  }
  // Check default map (exact match, then case-insensitive)
  if (DEFAULT_STATUS_MAP[jiraStatus]) {
    return { status: DEFAULT_STATUS_MAP[jiraStatus], wasUnmapped: false };
  }
  const lowerStatus = jiraStatus.toLowerCase();
  for (const [key, value] of Object.entries(DEFAULT_STATUS_MAP)) {
    if (key.toLowerCase() === lowerStatus) {
      return { status: value, wasUnmapped: false };
    }
  }
  return { status: 'on_hold', wasUnmapped: true };
}

/**
 * Maps the generic ORBIT workstream status (not_started/in_progress/complete/on_hold)
 * to the milestone-specific enum (upcoming/achieved/overdue/deferred).
 */
export function workstreamStatusToMilestoneStatus(
  workstreamStatus: string,
): 'upcoming' | 'achieved' | 'overdue' | 'deferred' {
  switch (workstreamStatus) {
    case 'complete': return 'achieved';
    case 'in_progress': return 'upcoming';
    case 'not_started': return 'upcoming';
    case 'on_hold': return 'deferred';
    default: return 'upcoming';
  }
}

// ── Text helpers ───────────────────────────────────────────────

function truncate(text: string | undefined | null, max: number, fallback: string = ''): string {
  if (!text) return fallback;
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}

/**
 * Extracts plain text from a Jira Atlassian Document Format (ADF) description.
 * Falls back to the raw string if it's not ADF.
 */
function adfToText(description: any): string | undefined {
  if (!description) return undefined;
  if (typeof description === 'string') return description;
  // ADF is an object with { type: 'doc', content: [...] }
  if (description?.type === 'doc' && Array.isArray(description.content)) {
    const texts: string[] = [];
    function walk(node: any) {
      if (node?.type === 'text' && typeof node.text === 'string') {
        texts.push(node.text);
      }
      if (Array.isArray(node?.content)) {
        node.content.forEach(walk);
      }
    }
    description.content.forEach(walk);
    return texts.join(' ').trim() || undefined;
  }
  return undefined;
}

function isoDateOnly(isoString: string | undefined | null): string | null {
  if (!isoString) return null;
  const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  // Fast path: already a plain date string
  if (ISO_DATE_RE.test(isoString)) return isoString;
  // Try slicing first (handles ISO-8601 datetimes like "2026-06-30T...")
  const sliced = isoString.slice(0, 10);
  if (ISO_DATE_RE.test(sliced)) return sliced;
  // Fallback: parse as Date and convert (handles "30/06/2026" etc.)
  try {
    const parsed = new Date(isoString).toISOString().slice(0, 10);
    if (ISO_DATE_RE.test(parsed)) {
      console.warn(`[jiraMappers] Non-ISO date normalised: "${isoString}" → "${parsed}"`);
      return parsed;
    }
  } catch {
    // fall through
  }
  console.warn(`[jiraMappers] Unparseable date discarded: "${isoString}"`);
  return null;
}

function weekLabel(isoString: string | undefined | null): string {
  if (!isoString) {
    isoString = new Date().toISOString();
  }
  const d = new Date(isoString);
  const year = d.getUTCFullYear();
  // ISO week number calculation
  const startOfYear = new Date(Date.UTC(year, 0, 1));
  const dayOfYear = Math.floor((d.getTime() - startOfYear.getTime()) / 86_400_000);
  const week = Math.ceil((dayOfYear + startOfYear.getUTCDay() + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

// ── Entity classifier ──────────────────────────────────────────

export type IssueClassification = 'milestone' | 'risk' | 'issue' | 'skip';

/**
 * Classifies a Jira issue into an ORBIT entity type.
 * Risk takes priority if the label or type matches.
 */
export function classifyIssue(issue: JiraIssue): IssueClassification {
  const typeName = (issue.fields.issuetype?.name ?? '').toLowerCase();
  const labels = (issue.fields.labels ?? []).map((l) => l.toLowerCase());
  const priority = (issue.fields.priority?.name ?? '').toLowerCase();

  // Risk classification (FR-020)
  if (typeName === 'risk' || labels.includes('orbit-risk')) {
    return 'risk';
  }

  // Blocker issue classification (FR-021)
  if (priority === 'blocker') {
    return 'issue';
  }

  // Story/Task/Sub-task → milestone (FR-019)
  if (['story', 'task', 'sub-task', 'subtask'].includes(typeName)) {
    return 'milestone';
  }

  return 'skip';
}

// ── Mapper functions ───────────────────────────────────────────

/**
 * Maps a Jira project to an ORBIT venture insert shape.
 * startDate and targetEndDate must be set by the caller after scanning issues.
 */
export function mapProjectToVenture(
  project: JiraProject,
  connectionId: string,
  systemUserId: string,
  startDate: string,
  targetEndDate: string,
  customMappings: Record<string, string> = {},
): {
  name: string;
  description: string | undefined;
  status: 'planning' | 'active' | 'on_hold' | 'complete' | 'archived';
  health: 'on_track' | 'at_risk' | 'off_track' | 'complete';
  startDate: string;
  targetEndDate: string;
  completionPct: number;
  pmUserId: string;
  createdBy: string;
  jiraConnectionId: string;
  jiraProjectKey: string;
  jiraSyncEnabled: boolean;
  setupStep: number;
} {
  // Determine venture status from project (projects don't have status in standard Jira API)
  // Default to 'active' for imported projects
  const ventureStatus = 'active' as const;

  return {
    name: truncate(project.name, 255, '(Untitled)'),
    description: project.description ? truncate(project.description, 2000) : undefined,
    status: ventureStatus,
    health: 'on_track',
    startDate,
    targetEndDate,
    completionPct: 0,
    pmUserId: systemUserId,
    createdBy: systemUserId,
    jiraConnectionId: connectionId,
    jiraProjectKey: project.key,
    jiraSyncEnabled: true,
    setupStep: 999, // bypass wizard — venture is Jira-managed
  };
}

/**
 * Maps a Jira epic to an ORBIT workstream insert shape.
 */
export function mapEpicToWorkstream(
  epic: JiraIssue,
  ventureId: string,
  sortOrder: number,
  customMappings: Record<string, string> = {},
): {
  ventureId: string;
  name: string;
  status: 'not_started' | 'in_progress' | 'complete' | 'on_hold';
  completionPct: number;
  sortOrder: number;
  baselineStart: string | null;
  baselineEnd: string | null;
  actualStart: string | null;
} {
  const jiraStatus = epic.fields.status?.name ?? 'To Do';
  const { status } = mapJiraStatus(jiraStatus, customMappings);
  const completionPct = Math.round(epic.fields.aggregateprogress?.percent ?? 0);

  // Use Jira epic start date (customfield_10015) and due date as the canonical range.
  const rangeStart = isoDateOnly(epic.fields.customfield_10015);
  const rangeEnd = isoDateOnly(epic.fields.duedate);

  return {
    ventureId,
    name: truncate(epic.fields.summary, 255, '(Untitled)'),
    status: status as 'not_started' | 'in_progress' | 'complete' | 'on_hold',
    completionPct: Math.min(100, Math.max(0, completionPct)),
    sortOrder,
    baselineStart: rangeStart ?? null,
    baselineEnd: rangeEnd ?? null,
    actualStart: status === 'in_progress' || status === 'complete' ? rangeStart ?? null : null,
  };
}

/**
 * Maps a Jira story/task to an ORBIT milestone insert shape.
 */
export function mapIssueToMilestone(
  issue: JiraIssue,
  workstreamId: string,
  fallbackDueDate: string,
  customMappings: Record<string, string> = {},
): {
  workstreamId: string;
  name: string;
  dueDate: string;
  actualCompletionDate: string | null;
  status: 'upcoming' | 'achieved' | 'overdue' | 'deferred';
} {
  const jiraStatus = issue.fields.status?.name ?? 'To Do';
  const { status: wsStatus } = mapJiraStatus(jiraStatus, customMappings);
  const milestoneStatus = workstreamStatusToMilestoneStatus(wsStatus);

  const dueDate =
    isoDateOnly(issue.fields.duedate) ??
    fallbackDueDate;

  const actualCompletionDate = isoDateOnly(issue.fields.resolutiondate);

  return {
    workstreamId,
    name: truncate(issue.fields.summary, 255, '(Untitled)'),
    dueDate,
    actualCompletionDate,
    status: milestoneStatus,
  };
}

/**
 * Maps a risk-type Jira issue to an ORBIT risk insert shape.
 */
export function mapIssueToRisk(
  issue: JiraIssue,
  ventureId: string,
  systemUserId: string,
  customMappings: Record<string, string> = {},
): {
  ventureId: string;
  title: string;
  description: string | undefined;
  likelihood: number;
  impact: number;
  riskScore: number;
  weight: number;
  rag: 'green' | 'amber' | 'red';
  ragOverride: boolean;
  status: 'open' | 'mitigated' | 'closed';
  escalated: boolean;
  createdBy: string;
} {
  const jiraStatus = issue.fields.status?.name ?? 'To Do';
  const { status: wsStatus } = mapJiraStatus(jiraStatus, customMappings);

  let riskStatus: 'open' | 'mitigated' | 'closed';
  if (wsStatus === 'complete') {
    riskStatus = 'mitigated';
  } else {
    riskStatus = 'open';
  }

  return {
    ventureId,
    title: truncate(issue.fields.summary, 255, '(Untitled)'),
    description: adfToText(issue.fields.description),
    likelihood: 3,
    impact: 3,
    riskScore: 9,   // 3 × 3
    weight: 3,
    rag: 'amber',   // default based on score 9
    ragOverride: false,
    status: riskStatus,
    escalated: false,
    createdBy: systemUserId,
  };
}

/**
 * Maps a blocker-priority Jira issue to an ORBIT issue insert shape.
 */
export function mapIssueToIssue(
  issue: JiraIssue,
  ventureId: string,
  systemUserId: string,
  customMappings: Record<string, string> = {},
): {
  ventureId: string;
  title: string;
  description: string | undefined;
  severity: 'blocker';
  status: 'open' | 'in_progress' | 'resolved';
  escalated: boolean;
  createdBy: string;
} {
  const jiraStatus = issue.fields.status?.name ?? 'To Do';
  const { status: wsStatus } = mapJiraStatus(jiraStatus, customMappings);

  let issueStatus: 'open' | 'in_progress' | 'resolved';
  if (wsStatus === 'complete') {
    issueStatus = 'resolved';
  } else if (wsStatus === 'in_progress') {
    issueStatus = 'in_progress';
  } else {
    issueStatus = 'open';
  }

  return {
    ventureId,
    title: truncate(issue.fields.summary, 255, '(Untitled)'),
    description: adfToText(issue.fields.description),
    severity: 'blocker',
    status: issueStatus,
    escalated: false,
    createdBy: systemUserId,
  };
}

/**
 * Maps a Jira epic comment to an ORBIT progress update insert shape.
 */
export function mapCommentToProgressUpdate(
  comment: JiraComment,
  ventureId: string,
  systemUserId: string,
  completionPct: number,
): {
  ventureId: string;
  submittedBy: string;
  submittedAt: Date;
  weekLabel: string;
  overallStatus: 'on_track';
  completionPct: number;
  narrative: string;
} {
  const submittedAt = comment.created ? new Date(comment.created) : new Date();
  const body = adfToText(comment.body) ?? '[No text content]';

  return {
    ventureId,
    submittedBy: systemUserId,
    submittedAt,
    weekLabel: weekLabel(comment.created),
    overallStatus: 'on_track',
    completionPct: Math.min(100, Math.max(0, completionPct)),
    narrative: body,
  };
}

/**
 * Computes a deterministic SHA-256 sync hash for an issue.
 * Used to detect changes during reconciliation without full field comparison.
 * Returns a 64-character hex string. The sync_hash column is sized for this output.
 *
 * IMPORTANT: Uses Node.js crypto.createHash('sha256') — not a custom integer hash.
 * A 32-bit integer hash (djb2 etc.) has unacceptable collision probability across
 * hundreds of issues and would cause changed entities to be silently skipped.
 */
export function computeSyncHash(issue: JiraIssue): string {
  const payload = JSON.stringify({
    summary: issue.fields.summary,
    status: issue.fields.status?.name,
    duedate: issue.fields.duedate,
    resolutiondate: issue.fields.resolutiondate,
    priority: issue.fields.priority?.name,
    labels: issue.fields.labels?.sort(),
    updated: issue.fields.updated,
  });
  return createHash('sha256').update(payload).digest('hex');
}

export { adfToText, isoDateOnly, weekLabel as computeWeekLabel, truncate };
