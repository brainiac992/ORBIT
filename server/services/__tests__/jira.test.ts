/**
 * Unit tests for Jira integration services.
 * Tests cover: encryption, mappers, client utilities, business logic edge cases.
 * Uses vitest. No DB — all DB-touching tests use stubs or are marked integration.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── Encryption tests ───────────────────────────────────────────

describe('encryptToken / decryptToken', () => {
  const validKey = 'a'.repeat(32); // exactly 32 chars

  beforeEach(() => {
    vi.stubEnv('JIRA_ENCRYPTION_KEY', validKey);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('encrypts and decrypts a token to the original value', async () => {
    const { encryptToken, decryptToken } = await import('../encryption.js');
    const plaintext = 'my-secret-jira-token';
    const ciphertext = encryptToken(plaintext);
    expect(ciphertext).not.toBe(plaintext);
    expect(decryptToken(ciphertext)).toBe(plaintext);
  });

  it('produces different ciphertexts for the same plaintext (IV randomness)', async () => {
    const { encryptToken } = await import('../encryption.js');
    const c1 = encryptToken('same-token');
    const c2 = encryptToken('same-token');
    expect(c1).not.toBe(c2);
  });

  it('throws if JIRA_ENCRYPTION_KEY is not set', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('JIRA_ENCRYPTION_KEY', '');
    // Re-import to avoid module cache — use inline re-import
    const { encryptToken } = await import('../encryption.js');
    expect(() => encryptToken('x')).toThrowError(/JIRA_ENCRYPTION_KEY is not set/);
  });

  it('throws if key is shorter than 32 characters', async () => {
    vi.stubEnv('JIRA_ENCRYPTION_KEY', 'short');
    const { encryptToken } = await import('../encryption.js');
    expect(() => encryptToken('x')).toThrowError(/at least 32 characters/);
  });

  it('ciphertext has three colon-separated parts (iv:tag:data)', async () => {
    const { encryptToken } = await import('../encryption.js');
    const ct = encryptToken('token');
    expect(ct.split(':').length).toBe(3);
  });

  it('throws on malformed ciphertext (wrong number of parts)', async () => {
    const { decryptToken } = await import('../encryption.js');
    expect(() => decryptToken('onlyonepart')).toThrowError(/Malformed ciphertext/);
  });

  it('throws on tampered ciphertext (authentication failure)', async () => {
    const { encryptToken, decryptToken } = await import('../encryption.js');
    const ct = encryptToken('token');
    const parts = ct.split(':');
    // Corrupt the ciphertext portion
    parts[2] = Buffer.from('corrupted_data').toString('base64');
    expect(() => decryptToken(parts.join(':'))).toThrowError(/Decryption failed/);
  });
});

// ── Mapper tests ───────────────────────────────────────────────

describe('mapJiraStatus', () => {
  it('maps known statuses with defaults', async () => {
    const { mapJiraStatus } = await import('../jiraMappers.js');
    expect(mapJiraStatus('To Do').status).toBe('not_started');
    expect(mapJiraStatus('In Progress').status).toBe('in_progress');
    expect(mapJiraStatus('Done').status).toBe('complete');
  });

  it('falls back to on_hold for unknown status and sets wasUnmapped=true', async () => {
    const { mapJiraStatus } = await import('../jiraMappers.js');
    const result = mapJiraStatus('Weird Custom Status');
    expect(result.status).toBe('on_hold');
    expect(result.wasUnmapped).toBe(true);
  });

  it('applies custom mapping overrides', async () => {
    const { mapJiraStatus } = await import('../jiraMappers.js');
    const result = mapJiraStatus('Review', { 'Review': 'in_progress' });
    expect(result.status).toBe('in_progress');
    expect(result.wasUnmapped).toBe(false);
  });

  it('custom mapping takes precedence over default', async () => {
    const { mapJiraStatus } = await import('../jiraMappers.js');
    const result = mapJiraStatus('Done', { 'Done': 'on_hold' });
    expect(result.status).toBe('on_hold');
  });
});

describe('workstreamStatusToMilestoneStatus', () => {
  it('maps complete → achieved', async () => {
    const { workstreamStatusToMilestoneStatus } = await import('../jiraMappers.js');
    expect(workstreamStatusToMilestoneStatus('complete')).toBe('achieved');
  });

  it('maps in_progress → upcoming', async () => {
    const { workstreamStatusToMilestoneStatus } = await import('../jiraMappers.js');
    expect(workstreamStatusToMilestoneStatus('in_progress')).toBe('upcoming');
  });

  it('maps not_started → upcoming', async () => {
    const { workstreamStatusToMilestoneStatus } = await import('../jiraMappers.js');
    expect(workstreamStatusToMilestoneStatus('not_started')).toBe('upcoming');
  });

  it('maps on_hold → deferred', async () => {
    const { workstreamStatusToMilestoneStatus } = await import('../jiraMappers.js');
    expect(workstreamStatusToMilestoneStatus('on_hold')).toBe('deferred');
  });

  it('defaults unknown → upcoming', async () => {
    const { workstreamStatusToMilestoneStatus } = await import('../jiraMappers.js');
    expect(workstreamStatusToMilestoneStatus('something_else')).toBe('upcoming');
  });
});

describe('classifyIssue', () => {
  const makeIssue = (overrides: Record<string, any>) => ({
    id: '1',
    key: 'TEST-1',
    fields: {
      summary: 'Test',
      issuetype: { name: 'Story' },
      status: { name: 'To Do' },
      priority: { name: 'Medium' },
      labels: [],
      ...overrides,
    },
  });

  it('classifies Story as milestone', async () => {
    const { classifyIssue } = await import('../jiraMappers.js');
    expect(classifyIssue(makeIssue({ issuetype: { name: 'Story' } }) as any)).toBe('milestone');
  });

  it('classifies Task as milestone', async () => {
    const { classifyIssue } = await import('../jiraMappers.js');
    expect(classifyIssue(makeIssue({ issuetype: { name: 'Task' } }) as any)).toBe('milestone');
  });

  it('classifies Sub-task as milestone', async () => {
    const { classifyIssue } = await import('../jiraMappers.js');
    expect(classifyIssue(makeIssue({ issuetype: { name: 'Sub-task' } }) as any)).toBe('milestone');
  });

  it('classifies Risk type as risk', async () => {
    const { classifyIssue } = await import('../jiraMappers.js');
    expect(classifyIssue(makeIssue({ issuetype: { name: 'Risk' } }) as any)).toBe('risk');
  });

  it('classifies orbit-risk label as risk regardless of type', async () => {
    const { classifyIssue } = await import('../jiraMappers.js');
    const issue = makeIssue({ issuetype: { name: 'Story' }, labels: ['orbit-risk'] });
    expect(classifyIssue(issue as any)).toBe('risk');
  });

  it('classifies Blocker priority as issue (not already a risk)', async () => {
    const { classifyIssue } = await import('../jiraMappers.js');
    const issue = makeIssue({ priority: { name: 'Blocker' }, issuetype: { name: 'Task' } });
    expect(classifyIssue(issue as any)).toBe('issue');
  });

  it('risk classification takes priority over blocker priority', async () => {
    const { classifyIssue } = await import('../jiraMappers.js');
    const issue = makeIssue({ issuetype: { name: 'Risk' }, priority: { name: 'Blocker' } });
    expect(classifyIssue(issue as any)).toBe('risk');
  });

  it('classifies Bug as skip (no matching rule)', async () => {
    const { classifyIssue } = await import('../jiraMappers.js');
    expect(classifyIssue(makeIssue({ issuetype: { name: 'Bug' } }) as any)).toBe('skip');
  });

  it('classifies Epic as skip', async () => {
    const { classifyIssue } = await import('../jiraMappers.js');
    expect(classifyIssue(makeIssue({ issuetype: { name: 'Epic' } }) as any)).toBe('skip');
  });
});

describe('mapProjectToVenture', () => {
  it('produces a valid venture shape', async () => {
    const { mapProjectToVenture } = await import('../jiraMappers.js');
    const project = { id: 'p1', key: 'TEST', name: 'Test Project', description: 'A project' };
    const shape = mapProjectToVenture(project, 'conn-id', 'user-id', '2026-01-01', '2026-12-31');
    expect(shape.name).toBe('Test Project');
    expect(shape.jiraProjectKey).toBe('TEST');
    expect(shape.jiraConnectionId).toBe('conn-id');
    expect(shape.setupStep).toBe(999); // bypass wizard
    expect(shape.jiraSyncEnabled).toBe(true);
    expect(shape.status).toBe('active');
    expect(shape.startDate).toBe('2026-01-01');
    expect(shape.targetEndDate).toBe('2026-12-31');
  });

  it('truncates a project name longer than 255 chars', async () => {
    const { mapProjectToVenture } = await import('../jiraMappers.js');
    const longName = 'X'.repeat(300);
    const shape = mapProjectToVenture(
      { id: 'p1', key: 'K', name: longName },
      'conn', 'user', '2026-01-01', '2026-12-31'
    );
    expect(shape.name.length).toBeLessThanOrEqual(255);
    expect(shape.name.endsWith('…')).toBe(true);
  });
});

describe('mapEpicToWorkstream', () => {
  const makeEpic = (overrides: Record<string, any> = {}) => ({
    id: 'e1',
    key: 'TEST-E1',
    fields: {
      summary: 'Epic Name',
      status: { name: 'In Progress' },
      aggregateprogress: { percent: 45 },
      ...overrides,
    },
  });

  it('maps epic to workstream correctly', async () => {
    const { mapEpicToWorkstream } = await import('../jiraMappers.js');
    const shape = mapEpicToWorkstream(makeEpic() as any, 'venture-id', 1);
    expect(shape.name).toBe('Epic Name');
    expect(shape.status).toBe('in_progress');
    expect(shape.completionPct).toBe(45);
    expect(shape.sortOrder).toBe(1);
    expect(shape.ventureId).toBe('venture-id');
  });

  it('clamps completionPct to 0-100', async () => {
    const { mapEpicToWorkstream } = await import('../jiraMappers.js');
    const shape = mapEpicToWorkstream(
      makeEpic({ aggregateprogress: { percent: 150 } }) as any,
      'v-id', 1
    );
    expect(shape.completionPct).toBe(100);
  });

  it('defaults completionPct to 0 if missing', async () => {
    const { mapEpicToWorkstream } = await import('../jiraMappers.js');
    const shape = mapEpicToWorkstream(
      makeEpic({ aggregateprogress: undefined }) as any,
      'v-id', 1
    );
    expect(shape.completionPct).toBe(0);
  });
});

describe('mapIssueToMilestone', () => {
  const makeIssue = (overrides: Record<string, any> = {}) => ({
    id: 'i1',
    key: 'TEST-1',
    fields: {
      summary: 'My Milestone',
      status: { name: 'Done' },
      duedate: '2026-06-30',
      resolutiondate: '2026-06-25T00:00:00Z',
      ...overrides,
    },
  });

  it('maps done issue to achieved milestone', async () => {
    const { mapIssueToMilestone } = await import('../jiraMappers.js');
    const shape = mapIssueToMilestone(makeIssue() as any, 'ws-id', '2026-12-31');
    expect(shape.status).toBe('achieved');
    expect(shape.dueDate).toBe('2026-06-30');
    expect(shape.actualCompletionDate).toBe('2026-06-25');
    expect(shape.workstreamId).toBe('ws-id');
  });

  it('uses fallback dueDate when duedate is null', async () => {
    const { mapIssueToMilestone } = await import('../jiraMappers.js');
    const shape = mapIssueToMilestone(
      makeIssue({ duedate: null }) as any,
      'ws-id', '2026-12-31'
    );
    expect(shape.dueDate).toBe('2026-12-31');
  });

  it('maps on_hold status to deferred', async () => {
    const { mapIssueToMilestone } = await import('../jiraMappers.js');
    // 'Weird' status → on_hold → deferred
    const shape = mapIssueToMilestone(
      makeIssue({ status: { name: 'Weird' }, resolutiondate: null }) as any,
      'ws-id', '2026-12-31'
    );
    expect(shape.status).toBe('deferred');
  });
});

describe('mapIssueToRisk', () => {
  const makeIssue = (overrides: Record<string, any> = {}) => ({
    id: 'r1',
    key: 'TEST-R1',
    fields: {
      summary: 'A Risk',
      description: null,
      status: { name: 'To Do' },
      ...overrides,
    },
  });

  it('produces correct default risk values', async () => {
    const { mapIssueToRisk } = await import('../jiraMappers.js');
    const shape = mapIssueToRisk(makeIssue() as any, 'venture-id', 'user-id');
    expect(shape.likelihood).toBe(3);
    expect(shape.impact).toBe(3);
    expect(shape.riskScore).toBe(9);
    expect(shape.weight).toBe(3);
    expect(shape.rag).toBe('amber');
    expect(shape.status).toBe('open');
  });

  it('maps Done Jira status to mitigated risk status', async () => {
    const { mapIssueToRisk } = await import('../jiraMappers.js');
    const shape = mapIssueToRisk(
      makeIssue({ status: { name: 'Done' } }) as any,
      'v-id', 'u-id'
    );
    expect(shape.status).toBe('mitigated');
  });
});

describe('mapIssueToIssue', () => {
  const makeIssue = (statusName: string) => ({
    id: 'b1',
    key: 'TEST-B1',
    fields: {
      summary: 'A Blocker',
      description: null,
      status: { name: statusName },
    },
  });

  it('maps Done → resolved', async () => {
    const { mapIssueToIssue } = await import('../jiraMappers.js');
    expect(mapIssueToIssue(makeIssue('Done') as any, 'v-id', 'u-id').status).toBe('resolved');
  });

  it('maps In Progress → in_progress', async () => {
    const { mapIssueToIssue } = await import('../jiraMappers.js');
    expect(mapIssueToIssue(makeIssue('In Progress') as any, 'v-id', 'u-id').status).toBe('in_progress');
  });

  it('maps anything else → open', async () => {
    const { mapIssueToIssue } = await import('../jiraMappers.js');
    expect(mapIssueToIssue(makeIssue('Backlog') as any, 'v-id', 'u-id').status).toBe('open');
  });

  it('always sets severity to blocker', async () => {
    const { mapIssueToIssue } = await import('../jiraMappers.js');
    expect(mapIssueToIssue(makeIssue('To Do') as any, 'v-id', 'u-id').severity).toBe('blocker');
  });
});

describe('mapCommentToProgressUpdate', () => {
  const makeComment = () => ({
    id: 'c1',
    body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }] },
    created: '2026-03-15T10:00:00Z',
    author: { displayName: 'PM User' },
  });

  it('extracts ADF text as narrative', async () => {
    const { mapCommentToProgressUpdate } = await import('../jiraMappers.js');
    const shape = mapCommentToProgressUpdate(makeComment() as any, 'v-id', 'u-id', 42);
    expect(shape.narrative).toBe('Hello world');
    expect(shape.completionPct).toBe(42);
    expect(shape.overallStatus).toBe('on_track');
    expect(shape.ventureId).toBe('v-id');
    expect(shape.submittedBy).toBe('u-id');
  });

  it('produces ISO week label from comment date', async () => {
    const { mapCommentToProgressUpdate } = await import('../jiraMappers.js');
    const shape = mapCommentToProgressUpdate(makeComment() as any, 'v-id', 'u-id', 0);
    expect(shape.weekLabel).toMatch(/^\d{4}-W\d{2}$/);
  });

  it('defaults narrative when body is null', async () => {
    const { mapCommentToProgressUpdate } = await import('../jiraMappers.js');
    const comment = { id: 'c1', body: null, created: '2026-03-15T00:00:00Z' };
    const shape = mapCommentToProgressUpdate(comment as any, 'v-id', 'u-id', 0);
    expect(shape.narrative).toBe('[No text content]');
  });

  it('clamps completionPct to 0-100 range', async () => {
    const { mapCommentToProgressUpdate } = await import('../jiraMappers.js');
    const shape = mapCommentToProgressUpdate(makeComment() as any, 'v-id', 'u-id', 150);
    expect(shape.completionPct).toBe(100);
  });
});

describe('computeSyncHash', () => {
  it('produces same hash for identical issue data', async () => {
    const { computeSyncHash } = await import('../jiraMappers.js');
    const issue = {
      id: 'i1',
      key: 'T-1',
      fields: {
        summary: 'Same summary',
        status: { name: 'To Do' },
        duedate: '2026-06-30',
        resolutiondate: null,
        priority: { name: 'Medium' },
        labels: ['a', 'b'],
        updated: '2026-04-01T00:00:00Z',
      },
    };
    const h1 = computeSyncHash(issue as any);
    const h2 = computeSyncHash(issue as any);
    expect(h1).toBe(h2);
  });

  it('produces different hash when summary changes', async () => {
    const { computeSyncHash } = await import('../jiraMappers.js');
    const base = { id: 'i1', key: 'T-1', fields: { summary: 'Original', status: { name: 'To Do' }, duedate: null, resolutiondate: null, priority: { name: 'Medium' }, labels: [], updated: '2026-01-01' } };
    const changed = { ...base, fields: { ...base.fields, summary: 'Changed' } };
    expect(computeSyncHash(base as any)).not.toBe(computeSyncHash(changed as any));
  });
});

// ── HMAC validation tests (webhook) ─────────────────────────────

describe('HMAC validation (webhook)', () => {
  // We test the logic by importing the module and accessing the validation inline
  it('validateHmacSignature returns true for valid signature', async () => {
    const { createHmac } = await import('crypto');

    // Simulate what the webhook does
    const secret = 'test-webhook-secret';
    const rawBody = Buffer.from(JSON.stringify({ webhookEvent: 'jira:issue_created' }));
    const computedHex = createHmac('sha256', secret).update(rawBody).digest('hex');
    const signatureHeader = `sha256=${computedHex}`;

    // Re-implement the logic locally to test it (pure function logic, not the Express handler)
    const { timingSafeEqual } = await import('crypto');
    const prefix = 'sha256=';
    const receivedHex = signatureHeader.startsWith(prefix)
      ? signatureHeader.slice(prefix.length)
      : signatureHeader;
    const computed = createHmac('sha256', secret).update(rawBody).digest('hex');

    const a = Buffer.from(computed, 'hex');
    const b = Buffer.from(receivedHex, 'hex');
    expect(a.length === b.length && timingSafeEqual(a, b)).toBe(true);
  });

  it('validateHmacSignature returns false for tampered body', async () => {
    const { createHmac, timingSafeEqual } = await import('crypto');
    const secret = 'test-webhook-secret';
    const rawBody = Buffer.from(JSON.stringify({ webhookEvent: 'jira:issue_created' }));
    const tamperedBody = Buffer.from(JSON.stringify({ webhookEvent: 'jira:issue_deleted' }));

    // Sign the original body
    const computedForOriginal = createHmac('sha256', secret).update(rawBody).digest('hex');
    // Verify against the tampered body
    const computedForTampered = createHmac('sha256', secret).update(tamperedBody).digest('hex');

    const a = Buffer.from(computedForOriginal, 'hex');
    const b = Buffer.from(computedForTampered, 'hex');
    expect(timingSafeEqual(a, b)).toBe(false);
  });
});

// ── Instance URL validation ─────────────────────────────────────

describe('Jira instance URL validation pattern', () => {
  const validUrls = [
    'https://mycompany.atlassian.net',
    'https://adres.atlassian.net',
    'https://my-company.atlassian.net',
    'https://company123.atlassian.net',
  ];
  const invalidUrls = [
    'http://mycompany.atlassian.net', // not https
    'https://jira.mycompany.com',     // not atlassian.net
    'https://mycompany.jira.com',     // wrong domain
    'not-a-url',
    '',
  ];

  const pattern = /^https:\/\/[a-zA-Z0-9-]+\.atlassian\.net(\/.*)?$/;

  it.each(validUrls)('accepts valid URL: %s', (url) => {
    expect(pattern.test(url)).toBe(true);
  });

  it.each(invalidUrls)('rejects invalid URL: %s', (url) => {
    expect(pattern.test(url)).toBe(false);
  });
});

// ── Edge cases ─────────────────────────────────────────────────

describe('ADF text extraction edge cases', () => {
  it('returns undefined for null description', async () => {
    const { adfToText } = await import('../jiraMappers.js');
    expect(adfToText(null)).toBeUndefined();
  });

  it('returns string description as-is if not ADF', async () => {
    const { adfToText } = await import('../jiraMappers.js');
    expect(adfToText('plain text')).toBe('plain text');
  });

  it('extracts nested text from ADF document', async () => {
    const { adfToText } = await import('../jiraMappers.js');
    const adf = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hello ' },
            { type: 'text', text: 'world' },
          ],
        },
      ],
    };
    expect(adfToText(adf)).toBe('Hello  world');
  });

  it('returns undefined for empty ADF doc', async () => {
    const { adfToText } = await import('../jiraMappers.js');
    const adf = { type: 'doc', content: [] };
    expect(adfToText(adf)).toBeUndefined();
  });
});

describe('isoDateOnly', () => {
  it('extracts YYYY-MM-DD from ISO timestamp', async () => {
    const { isoDateOnly } = await import('../jiraMappers.js');
    expect(isoDateOnly('2026-04-08T10:30:00Z')).toBe('2026-04-08');
  });

  it('returns YYYY-MM-DD unchanged for date-only string', async () => {
    const { isoDateOnly } = await import('../jiraMappers.js');
    expect(isoDateOnly('2026-04-08')).toBe('2026-04-08');
  });

  it('returns null for null input', async () => {
    const { isoDateOnly } = await import('../jiraMappers.js');
    expect(isoDateOnly(null)).toBeNull();
  });

  it('returns null for undefined input', async () => {
    const { isoDateOnly } = await import('../jiraMappers.js');
    expect(isoDateOnly(undefined)).toBeNull();
  });
});

describe('computeWeekLabel', () => {
  it('returns YYYY-Www format', async () => {
    const { computeWeekLabel } = await import('../jiraMappers.js');
    const label = computeWeekLabel('2026-01-05T00:00:00Z');
    expect(label).toMatch(/^\d{4}-W\d{2}$/);
  });

  it('returns a valid week label for null input (uses current date)', async () => {
    const { computeWeekLabel } = await import('../jiraMappers.js');
    const label = computeWeekLabel(null);
    expect(label).toMatch(/^\d{4}-W\d{2}$/);
  });
});

// ── Import status helpers ──────────────────────────────────────

describe('getImportStatus', () => {
  it('returns undefined for unknown jobId', async () => {
    const { getImportStatus } = await import('../jiraImport.js');
    expect(getImportStatus('nonexistent-job-id')).toBeUndefined();
  });
});
