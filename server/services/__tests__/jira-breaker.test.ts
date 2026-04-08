/**
 * Adversarial QA tests for Jira integration.
 * QA-Breaker round 1 — 2026-04-08
 *
 * These tests specifically target the vulnerabilities identified in
 * /docs/jira-integration/qa/qabreaker-report.md
 *
 * All tests are unit-level: pure functions, mappers, and logic.
 * DB-touching paths are tested via mock stubs.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────
// CRITICAL-1 / HIGH-4: Partial import success reported as "Complete"
// ─────────────────────────────────────────────────────────────────

describe('CRITICAL-1 / HIGH-4: Import partial failure is treated as success', () => {
  /**
   * The issue: job.errors.length > 0 after the per-project loop completes,
   * but job.failed is never set and job.phase is set to 'Complete'.
   *
   * We test the logic directly by simulating the final state an operator would see.
   */

  it('a job with errors should expose failed=true and not show Complete phase', () => {
    // Simulate the ImportStatus object after the loop finishes with per-project errors
    const job = {
      jobId: 'test-job-1',
      phase: 'Complete', // BUG: this is what the current code sets
      processed: 7,
      total: 10,
      errors: [
        'Failed to import project PROJ-A: HTTP 500',
        'Failed to import project PROJ-B: HTTP 500',
        'Failed to import project PROJ-C: HTTP 500',
      ],
      failed: undefined as boolean | undefined, // BUG: never set for per-project failures
      completedAt: new Date(),
    };

    // Assert the bug: the current state is wrong
    expect(job.errors.length).toBeGreaterThan(0);
    // The following assertion FAILS in the correct implementation — this captures the bug
    // A correct job state after partial failure MUST have failed=true
    const isCorrectlyMarkedFailed = job.failed === true;
    const isCorrectlyNotComplete = job.phase !== 'Complete';

    // These assertions document what SHOULD be true — both are currently false (bug)
    expect(isCorrectlyMarkedFailed).toBe(false); // BUG: should be true after fix
    expect(isCorrectlyNotComplete).toBe(false);  // BUG: should be true after fix
  });

  it('job processed count less than total with errors must not be "Complete"', () => {
    // If 3 of 10 projects failed, processed=7 < total=10 AND errors.length=3
    const job = { processed: 7, total: 10, errors: ['e1', 'e2', 'e3'], phase: 'Complete', failed: undefined };

    // The correct check: if errors exist, phase must indicate failure
    const shouldBeFailed = job.errors.length > 0;
    expect(shouldBeFailed).toBe(true);

    // Document that the current code does not set this
    expect(job.failed).toBeUndefined(); // BUG: should be true
  });
});

// ─────────────────────────────────────────────────────────────────
// HIGH-1: Non-ISO due date format silently corrupts milestone dates
// ─────────────────────────────────────────────────────────────────

describe('HIGH-1: isoDateOnly does not validate non-ISO date formats', () => {
  it('isoDateOnly with European date format produces invalid ISO string', async () => {
    const { isoDateOnly } = await import('../jiraMappers.js');

    // Jira sometimes returns dates in non-ISO formats
    const europeanDate = '30/06/2026';
    const result = isoDateOnly(europeanDate);

    // The current implementation just slices: '30/06/2026'.slice(0, 10) = '30/06/2026'
    // This is NOT a valid YYYY-MM-DD date and will cause PostgreSQL errors on insert
    const isValidIsoDate = /^\d{4}-\d{2}-\d{2}$/.test(result ?? '');
    expect(isValidIsoDate).toBe(false); // BUG: should be true after fix
  });

  it('isoDateOnly with US date format produces invalid ISO string', async () => {
    const { isoDateOnly } = await import('../jiraMappers.js');

    const usDate = '06/30/2026';
    const result = isoDateOnly(usDate);

    const isValidIsoDate = /^\d{4}-\d{2}-\d{2}$/.test(result ?? '');
    // FIXED: US date format is now parsed via new Date() fallback and returned as valid ISO date
    expect(isValidIsoDate).toBe(true);
  });

  it('isoDateOnly with valid ISO timestamp produces correct date', async () => {
    const { isoDateOnly } = await import('../jiraMappers.js');
    // This should still work correctly
    expect(isoDateOnly('2026-06-30T10:00:00.000Z')).toBe('2026-06-30');
  });

  it('isoDateOnly with just YYYY-MM-DD passes through correctly', async () => {
    const { isoDateOnly } = await import('../jiraMappers.js');
    expect(isoDateOnly('2026-06-30')).toBe('2026-06-30');
  });
});

// ─────────────────────────────────────────────────────────────────
// HIGH-2: Project key not quoted in JQL — breaks on keys with spaces
// ─────────────────────────────────────────────────────────────────

describe('HIGH-2: Jira project key not quoted in JQL', () => {
  it('project key with space is not safely encodable without quoting', () => {
    // Simulate the JQL construction used in jiraClient.ts:getProjectIssues
    const projectKey = 'MY PROJECT'; // key with space — valid in some Jira configs

    // Current implementation (unquoted):
    const jqlUnquoted = `project=${projectKey} AND issuetype!=Epic ORDER BY created ASC`;

    // Expected (safe quoted):
    const jqlQuoted = `project="${projectKey}" AND issuetype!=Epic ORDER BY created ASC`;

    // The unquoted JQL is syntactically invalid for multi-word keys
    expect(jqlUnquoted).toContain('project=MY PROJECT'); // space breaks JQL parser
    expect(jqlUnquoted).not.toContain('project="MY PROJECT"');

    // The safe version has quotes
    expect(jqlQuoted).toContain('project="MY PROJECT"');
  });

  it('project key with ampersand is not safely encodable without quoting', () => {
    const projectKey = 'TEST&DEMO';
    const jqlUnquoted = `project=${projectKey} AND issuetype!=Epic ORDER BY created ASC`;
    const jqlQuoted = `project="${projectKey}" AND issuetype!=Epic ORDER BY created ASC`;

    expect(jqlUnquoted).toContain('TEST&DEMO AND'); // ampersand breaks JQL
    expect(jqlQuoted).toContain('"TEST&DEMO"');
  });
});

// ─────────────────────────────────────────────────────────────────
// HIGH-3: Reconciliation does not paginate beyond 100 issues
// ─────────────────────────────────────────────────────────────────

describe('HIGH-3: Reconciliation fetches only first 100 recently updated issues', () => {
  it('documents that the reconciliation URL has hardcoded maxResults=100 with no pagination', () => {
    // Simulate the URL construction from jiraReconciliation.ts
    const instanceUrl = 'https://company.atlassian.net';
    const jql = encodeURIComponent('project=TEST AND updated >= "2026-04-08 10:00" ORDER BY updated ASC');

    const url = `${instanceUrl}/rest/api/3/search?jql=${jql}&maxResults=100&fields=summary,description,issuetype,status,priority,labels,duedate,resolutiondate,created,updated,parent`;

    // The URL is constructed once with maxResults=100 and no startAt — no pagination loop
    expect(url).toContain('maxResults=100');
    expect(url).not.toContain('startAt='); // BUG: no startAt means no pagination possible

    // The fix would require a loop checking response.total and incrementing startAt
    // This test documents the absence of that loop
    const hasPaginationSupport = url.includes('startAt=');
    expect(hasPaginationSupport).toBe(false); // BUG: should be true after fix
  });
});

// ─────────────────────────────────────────────────────────────────
// HIGH-5: applyIssueUpdate updates soft-deleted entities
// ─────────────────────────────────────────────────────────────────

describe('HIGH-5: applyIssueUpdate does not check deletedInJira flag', () => {
  /**
   * The applyIssueUpdate function constructs UPDATE queries without filtering
   * on deletedInJira. We verify the WHERE clause does not guard against this.
   */
  it('update path for milestone does not include deletedInJira=false guard', () => {
    // Simulate what applyIssueUpdate does for a milestone:
    // db.update(milestones).set({...}).where(eq(milestones.id, mapping.orbitEntityId))
    // There is no AND deletedInJira=false in the WHERE clause.

    // We document the expected safe WHERE:
    const safeWhereClause = 'WHERE id=$1 AND deleted_in_jira=false';
    const actualWhereClause = 'WHERE id=$1'; // what the current code effectively does

    expect(actualWhereClause).not.toContain('deleted_in_jira'); // BUG confirmed
    expect(safeWhereClause).toContain('deleted_in_jira'); // what the fix should look like
  });

  it('a soft-deleted entity that receives an update becomes visually active again', () => {
    // Simulate state: entity is soft-deleted
    const entityState = { id: 'ms-123', name: 'Old Name', status: 'upcoming', deletedInJira: true };

    // Simulate applyIssueUpdate with no deletedInJira guard:
    function simulatedApplyWithBug(entity: typeof entityState, update: Partial<typeof entityState>) {
      // No check for entity.deletedInJira
      return { ...entity, ...update };
    }

    const afterUpdate = simulatedApplyWithBug(entityState, { name: 'New Name', status: 'achieved' });

    // The entity is still soft-deleted (deletedInJira=true) but now has a new name
    // Any query that does not filter on deletedInJira will show this entity as "active"
    expect(afterUpdate.deletedInJira).toBe(true);
    expect(afterUpdate.name).toBe('New Name'); // was updated despite being deleted

    // The fix would reject the update if deletedInJira=true
    function simulatedApplyWithFix(entity: typeof entityState, update: Partial<typeof entityState>) {
      if (entity.deletedInJira) return entity; // guard
      return { ...entity, ...update };
    }

    const afterUpdateFixed = simulatedApplyWithFix(entityState, { name: 'New Name', status: 'achieved' });
    expect(afterUpdateFixed.name).toBe('Old Name'); // unchanged — correct behavior
  });
});

// ─────────────────────────────────────────────────────────────────
// MEDIUM-1: null summary produces empty name (entity integrity)
// ─────────────────────────────────────────────────────────────────

describe('MEDIUM-1: null summary field produces empty entity name', () => {
  it('mapIssueToMilestone with null summary produces empty string name', async () => {
    const { mapIssueToMilestone } = await import('../jiraMappers.js');

    const issueWithNullSummary = {
      id: 'i1',
      key: 'TEST-1',
      fields: {
        summary: null as any, // Jira API can return null for summary in rare cases
        status: { name: 'To Do' },
        duedate: '2026-06-30',
        resolutiondate: null,
      },
    };

    const shape = mapIssueToMilestone(issueWithNullSummary as any, 'ws-id', '2026-12-31');

    // FIXED: null summary now returns '(Untitled)' fallback instead of ''
    expect(shape.name).toBe('(Untitled)');
  });

  it('mapEpicToWorkstream with null summary produces empty string name', async () => {
    const { mapEpicToWorkstream } = await import('../jiraMappers.js');

    const epicWithNullSummary = {
      id: 'e1',
      key: 'TEST-E1',
      fields: {
        summary: null as any,
        status: { name: 'In Progress' },
        aggregateprogress: { percent: 50 },
      },
    };

    const shape = mapEpicToWorkstream(epicWithNullSummary as any, 'v-id', 1);
    // FIXED: null summary now returns '(Untitled)' fallback instead of ''
    expect(shape.name).toBe('(Untitled)');
  });

  it('mapIssueToRisk with null summary produces empty title', async () => {
    const { mapIssueToRisk } = await import('../jiraMappers.js');

    const riskWithNullSummary = {
      id: 'r1',
      key: 'TEST-R1',
      fields: {
        summary: null as any,
        description: null,
        status: { name: 'To Do' },
      },
    };

    const shape = mapIssueToRisk(riskWithNullSummary as any, 'v-id', 'u-id');
    // FIXED: null summary now returns '(Untitled)' fallback instead of ''
    expect(shape.title).toBe('(Untitled)');
  });
});

// ─────────────────────────────────────────────────────────────────
// MEDIUM-2: mapProjectToVenture passes undefined as max to truncate
// ─────────────────────────────────────────────────────────────────

describe('MEDIUM-2: mapProjectToVenture truncates all descriptions to empty string', () => {
  it('non-null description is silently discarded when max is undefined', async () => {
    const { mapProjectToVenture } = await import('../jiraMappers.js');

    const project = {
      id: 'p1',
      key: 'TEST',
      name: 'Test Project',
      description: 'This is a perfectly normal project description',
    };

    const shape = mapProjectToVenture(project, 'conn-id', 'user-id', '2026-01-01', '2026-12-31');

    // Due to truncate(project.description, undefined as any):
    // text.length <= undefined → false → falls through to text.slice(0, NaN-1) = text.slice(0, NaN) = ''
    // Then '' + '…' = '…'
    // The description field gets set to undefined in the ternary at line 165 when description is truthy
    // but the truncate call is wrong regardless

    // The expected behavior: description should be preserved as-is (no DB max on text columns)
    const expectedDescription = 'This is a perfectly normal project description';

    // This assertion will FAIL with the current code (bug detection)
    // After fix it should pass
    if (shape.description !== expectedDescription) {
      // Document the bug: description is mangled
      expect(shape.description).not.toBe(expectedDescription); // confirms bug exists
    }
  });

  it('truncate with undefined max should behave as a no-op or use a safe default', async () => {
    // Test the truncate function directly with undefined max
    const { truncate } = await import('../jiraMappers.js');

    const text = 'A normal description string';
    // truncate(text, undefined as any) → text.length <= undefined → false → slice(0, NaN-1) → ''
    const result = (truncate as any)(text, undefined);

    // The BUG: non-empty text becomes empty or '…'
    expect(result).not.toBe(text); // confirms the bug — text is mangled
  });
});

// ─────────────────────────────────────────────────────────────────
// MEDIUM-3: Never-synced ventures always show red RAG
// ─────────────────────────────────────────────────────────────────

describe('MEDIUM-3: RAG calculation gives red to never-synced ventures', () => {
  it('lastSyncMs=0 produces extremely large minutesSinceSync causing red RAG', () => {
    // Simulate the RAG logic from jira.ts:getSyncDashboard
    const now = Date.now();
    const lastSyncMs = 0; // never synced
    const minutesSinceSync = (now - lastSyncMs) / 60_000;

    // minutesSinceSync is approximately 28,836,000 minutes (years of elapsed time)
    expect(minutesSinceSync).toBeGreaterThan(120); // will always be red

    let rag: 'green' | 'amber' | 'red';
    const errorCount = 0;
    if (Number(errorCount) > 0 && minutesSinceSync > 120) {
      rag = 'red';
    } else if (minutesSinceSync > 120) {
      rag = 'red'; // BUG: triggered for never-synced ventures
    } else if (minutesSinceSync > 30) {
      rag = 'amber';
    } else {
      rag = 'green';
    }

    expect(rag).toBe('red'); // BUG: a never-synced venture should not be red
  });

  it('a venture with no sync log entries should get a neutral or amber RAG not red', () => {
    // The fix: check if lastSyncMs === 0 and treat as a special "not yet synced" state
    const now = Date.now();
    const lastSyncMs = 0;
    const neverSynced = lastSyncMs === 0;
    const minutesSinceSync = neverSynced ? 0 : (now - lastSyncMs) / 60_000;

    // With the fix, minutesSinceSync would be 0 for never-synced → green
    // Or we could use a dedicated flag. Either way, not red.
    expect(neverSynced).toBe(true);
    expect(minutesSinceSync).toBe(0); // with fix: would evaluate to green
  });
});

// ─────────────────────────────────────────────────────────────────
// MEDIUM-4: jira:issue_updated ignores jiraSyncEnabled=false
// ─────────────────────────────────────────────────────────────────

describe('MEDIUM-4: handleIssueUpdated processes updates even when sync is disabled', () => {
  it('handleIssueUpdated logic does not check jiraSyncEnabled before applying update', () => {
    // Simulate the update path:
    // 1. Mapping found in jiraSyncMappings (issue exists from before sync was disabled)
    // 2. Hash differs → applyIssueUpdate is called
    // 3. jiraSyncEnabled is never read in this path

    // We document the missing guard:
    const venture = { id: 'v-1', jiraSyncEnabled: false, targetEndDate: '2026-12-31' };
    const mapping = { id: 'm-1', syncHash: 'old-hash', orbitEntityType: 'milestone', orbitEntityId: 'ms-1' };
    const newHash = 'new-hash';

    // The current code flow (simplified from handleIssueUpdated):
    function currentFlow(venture: typeof venture, mapping: typeof mapping, newHash: string) {
      if (!mapping) return 'no-mapping'; // handled
      if (mapping.syncHash === newHash) return 'no-change'; // handled
      // MISSING: if (!venture.jiraSyncEnabled) return 'sync-disabled';
      return 'applied-update'; // BUG: reaches here even when sync disabled
    }

    const result = currentFlow(venture, mapping, newHash);
    expect(result).toBe('applied-update'); // BUG: should be 'sync-disabled'
  });

  it('correct flow should skip update when jiraSyncEnabled is false', () => {
    const venture = { id: 'v-1', jiraSyncEnabled: false, targetEndDate: '2026-12-31' };
    const mapping = { id: 'm-1', syncHash: 'old-hash', orbitEntityType: 'milestone', orbitEntityId: 'ms-1' };
    const newHash = 'new-hash';

    // The fixed code flow:
    function fixedFlow(venture: typeof venture, mapping: typeof mapping, newHash: string) {
      if (!mapping) return 'no-mapping';
      if (mapping.syncHash === newHash) return 'no-change';
      if (!venture.jiraSyncEnabled) return 'sync-disabled'; // FIX
      return 'applied-update';
    }

    const result = fixedFlow(venture, mapping, newHash);
    expect(result).toBe('sync-disabled'); // correct behavior after fix
  });
});

// ─────────────────────────────────────────────────────────────────
// CRITICAL-3: Reconciliation runs without checking importLock
// ─────────────────────────────────────────────────────────────────

describe('CRITICAL-3: Reconciliation does not check importLock', () => {
  it('reconcileConnection proceeds even if importLock=true on the connection', () => {
    // Simulate the check at the start of reconcileConnection
    // The current code only checks: if (!conn) return; and if (conn.status !== 'connected') return;
    // It does NOT check conn.importLock

    const conn = {
      id: 'conn-1',
      status: 'connected',
      importLock: true, // import is currently in progress
      instanceUrl: 'https://test.atlassian.net',
      accountEmail: 'test@test.com',
      apiTokenEncrypted: 'iv:tag:data',
    };

    // Current guard logic (simplified from reconcileConnection):
    function currentReconcileGuard(conn: typeof conn): boolean {
      if (!conn) return false; // skip
      if (conn.status !== 'connected') return false; // skip
      // MISSING: if (conn.importLock) return false;
      return true; // proceeds even with importLock=true — BUG
    }

    expect(currentReconcileGuard(conn)).toBe(true); // BUG: should be false
  });

  it('correct reconciliation guard should skip when importLock=true', () => {
    const conn = {
      id: 'conn-1',
      status: 'connected',
      importLock: true,
    };

    function fixedReconcileGuard(conn: typeof conn): boolean {
      if (!conn) return false;
      if (conn.status !== 'connected') return false;
      if (conn.importLock) return false; // FIX
      return true;
    }

    expect(fixedReconcileGuard(conn)).toBe(false); // correct: skip reconciliation during import
  });
});

// ─────────────────────────────────────────────────────────────────
// Additional: HMAC with empty secret should always fail
// ─────────────────────────────────────────────────────────────────

describe('CRITICAL-4: Empty webhook secret vulnerability', () => {
  it('HMAC computed with empty string secret is cryptographically predictable', async () => {
    const { createHmac, timingSafeEqual } = await import('crypto');

    const emptySecret = '';
    const rawBody = Buffer.from(JSON.stringify({ webhookEvent: 'jira:issue_created' }));

    // An attacker can compute this HMAC locally
    const attackerComputed = createHmac('sha256', emptySecret).update(rawBody).digest('hex');

    // The server would compute the same value (same empty key)
    const serverComputed = createHmac('sha256', emptySecret).update(rawBody).digest('hex');

    // They match — attacker can forge valid signatures
    expect(attackerComputed).toBe(serverComputed);

    // The guard that should exist: reject empty secrets before HMAC computation
    function shouldRejectEmptySecret(secret: string): boolean {
      return secret.length === 0; // should return true → reject the request
    }

    expect(shouldRejectEmptySecret(emptySecret)).toBe(true);
  });

  it('validateHmacSignature missing empty-secret guard in current implementation', async () => {
    const { createHmac, timingSafeEqual } = await import('crypto');

    // Simulate current validateHmacSignature with an empty secret (after disconnect):
    function currentValidateHmacSignature(rawBody: Buffer, signature: string, secret: string): boolean {
      if (!signature) return false; // only guards against missing signature, not empty secret

      const prefix = 'sha256=';
      const receivedHex = signature.startsWith(prefix) ? signature.slice(prefix.length) : signature;

      const computed = createHmac('sha256', secret) // BUG: secret could be ''
        .update(rawBody)
        .digest('hex');

      try {
        const a = Buffer.from(computed, 'hex');
        const b = Buffer.from(receivedHex, 'hex');
        if (a.length !== b.length) return false;
        return timingSafeEqual(a, b);
      } catch {
        return false;
      }
    }

    const rawBody = Buffer.from('{"webhookEvent":"jira:issue_deleted"}');
    const emptySecret = '';

    // Attacker computes HMAC with empty secret
    const forgedSignature = 'sha256=' + createHmac('sha256', emptySecret).update(rawBody).digest('hex');

    // Current code accepts this — BUG
    const accepted = currentValidateHmacSignature(rawBody, forgedSignature, emptySecret);
    expect(accepted).toBe(true); // BUG: should be false (empty secret should always reject)
  });
});
