/**
 * Jira Cloud REST API v3 client.
 * Uses Node.js built-in fetch — no external HTTP libraries.
 *
 * All methods handle:
 *   - Basic Auth (base64 email:token)
 *   - HTTP 429 with exponential backoff (max 3 retries)
 *   - Clear, specific error messages on every failure path
 */

const MAX_RETRIES = 3;
const DEFAULT_RETRY_AFTER_MS = 10_000;

function buildAuthHeader(email: string, token: string): string {
  return 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps fetch with retry-on-429 logic.
 * Throws a descriptive Error if all retries are exhausted or a non-retryable error occurs.
 */
async function jiraFetch(
  url: string,
  options: RequestInit,
  context: string,
): Promise<Response> {
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= MAX_RETRIES) {
    let response: Response;
    try {
      response = await fetch(url, options);
    } catch (networkErr) {
      throw new Error(
        `[${context}] Network error contacting Jira (${url}): ${(networkErr as Error).message}`
      );
    }

    if (response.status === 429) {
      if (attempt === MAX_RETRIES) {
        throw new Error(
          `[${context}] Jira rate limit (HTTP 429) persisted after ${MAX_RETRIES} retries. ` +
          'Reduce import frequency or wait before retrying.'
        );
      }
      const retryAfterHeader = response.headers.get('Retry-After');
      const waitMs = retryAfterHeader
        ? parseInt(retryAfterHeader, 10) * 1000
        : DEFAULT_RETRY_AFTER_MS * Math.pow(2, attempt);

      console.warn(`[jiraClient] Rate-limited. Waiting ${waitMs}ms before retry ${attempt + 1}/${MAX_RETRIES}.`);
      await sleep(waitMs);
      attempt++;
      continue;
    }

    return response;
  }

  throw lastError ?? new Error(`[${context}] Unexpected retry loop exit.`);
}

// ── Type definitions ───────────────────────────────────────────

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  description?: string;
  projectTypeKey?: string;
  lead?: { displayName?: string };
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description?: any;
    issuetype?: { name?: string };
    status?: { name?: string };
    priority?: { name?: string };
    labels?: string[];
    duedate?: string | null;
    resolutiondate?: string | null;
    created?: string;
    updated?: string;
    parent?: { id?: string; key?: string };
    epic?: { id?: string; key?: string };
    aggregateprogress?: { percent?: number };
    comment?: {
      comments?: JiraComment[];
      total?: number;
    };
  };
}

export interface JiraComment {
  id: string;
  body?: any;
  created?: string;
  author?: { displayName?: string; emailAddress?: string };
}

export interface JiraWebhookRegistration {
  id: number;
  url: string;
}

// ── API Methods ────────────────────────────────────────────────

/**
 * Verifies credentials by calling GET /rest/api/3/myself.
 * Returns success flag, the Jira account display name on success, or an error message.
 */
export async function testConnection(
  instanceUrl: string,
  email: string,
  token: string,
): Promise<{ success: boolean; accountName?: string; error?: string }> {
  const url = `${instanceUrl.replace(/\/$/, '')}/rest/api/3/myself`;
  let response: Response;
  try {
    response = await jiraFetch(
      url,
      {
        method: 'GET',
        headers: {
          Authorization: buildAuthHeader(email, token),
          Accept: 'application/json',
        },
      },
      'testConnection',
    );
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  if (response.status === 401) {
    return { success: false, error: '401 Unauthorized — check your email and API token.' };
  }
  if (response.status === 403) {
    return { success: false, error: '403 Forbidden — the API token does not have sufficient permissions.' };
  }
  if (!response.ok) {
    return {
      success: false,
      error: `Jira returned HTTP ${response.status} — ${response.statusText}. Check the instance URL and credentials.`,
    };
  }

  const body = await response.json() as { displayName?: string };
  return { success: true, accountName: body.displayName ?? email };
}

/**
 * Fetches all Jira projects (paginated internally, returns full list).
 */
export async function getProjects(
  instanceUrl: string,
  email: string,
  token: string,
): Promise<JiraProject[]> {
  const base = instanceUrl.replace(/\/$/, '');
  const pageSize = 50;
  const all: JiraProject[] = [];
  let startAt = 0;
  let total = Infinity;

  while (startAt < total) {
    const url = `${base}/rest/api/3/project/search?maxResults=${pageSize}&startAt=${startAt}&expand=description,lead`;
    const response = await jiraFetch(
      url,
      {
        method: 'GET',
        headers: {
          Authorization: buildAuthHeader(email, token),
          Accept: 'application/json',
        },
      },
      'getProjects',
    );

    if (!response.ok) {
      throw new Error(
        `[getProjects] Jira returned HTTP ${response.status} when listing projects. ` +
        `Check API token permissions (requires Browse Projects).`
      );
    }

    const body = await response.json() as {
      values: JiraProject[];
      total: number;
      isLast?: boolean;
    };

    all.push(...(body.values ?? []));
    total = body.total ?? 0;
    startAt += pageSize;

    if (body.isLast === true || all.length >= total) break;
  }

  return all;
}

/**
 * Fetches all issues for a project (excluding epics), paginated.
 * startAt parameter is the pagination offset for chunked import.
 * Returns { issues, total } for the current page.
 */
export async function getProjectIssues(
  instanceUrl: string,
  email: string,
  token: string,
  projectKey: string,
  startAt: number = 0,
): Promise<{ issues: JiraIssue[]; total: number }> {
  const base = instanceUrl.replace(/\/$/, '');
  const pageSize = 100;
  const jql = encodeURIComponent(`project="${projectKey}" AND issuetype!=Epic ORDER BY created ASC`);
  const url = `${base}/rest/api/3/search?jql=${jql}&maxResults=${pageSize}&startAt=${startAt}&fields=summary,description,issuetype,status,priority,labels,duedate,resolutiondate,created,updated,parent`;

  const response = await jiraFetch(
    url,
    {
      method: 'GET',
      headers: {
        Authorization: buildAuthHeader(email, token),
        Accept: 'application/json',
      },
    },
    `getProjectIssues(${projectKey})`,
  );

  if (!response.ok) {
    throw new Error(
      `[getProjectIssues] Jira returned HTTP ${response.status} for project ${projectKey}. ` +
      'Verify the project key and API token permissions.'
    );
  }

  const body = await response.json() as { issues: JiraIssue[]; total: number };
  return { issues: body.issues ?? [], total: body.total ?? 0 };
}

/**
 * Fetches all epics for a project (paginated internally, returns full list).
 */
export async function getEpics(
  instanceUrl: string,
  email: string,
  token: string,
  projectKey: string,
): Promise<JiraIssue[]> {
  const base = instanceUrl.replace(/\/$/, '');
  const pageSize = 50;
  const all: JiraIssue[] = [];
  let startAt = 0;
  let total = Infinity;

  while (startAt < total) {
    const jql = encodeURIComponent(`project="${projectKey}" AND issuetype=Epic ORDER BY created ASC`);
    const url = `${base}/rest/api/3/search?jql=${jql}&maxResults=${pageSize}&startAt=${startAt}&fields=summary,description,status,aggregateprogress,created,duedate`;

    const response = await jiraFetch(
      url,
      {
        method: 'GET',
        headers: {
          Authorization: buildAuthHeader(email, token),
          Accept: 'application/json',
        },
      },
      `getEpics(${projectKey})`,
    );

    if (!response.ok) {
      throw new Error(
        `[getEpics] Jira returned HTTP ${response.status} for project ${projectKey}.`
      );
    }

    const body = await response.json() as { issues: JiraIssue[]; total: number };
    all.push(...(body.issues ?? []));
    total = body.total ?? 0;
    startAt += pageSize;
    if (all.length >= total) break;
  }

  return all;
}

/**
 * Fetches all comments for a Jira issue/epic (paginated internally, returns full list).
 */
export async function getIssueComments(
  instanceUrl: string,
  email: string,
  token: string,
  issueKeyOrId: string,
): Promise<JiraComment[]> {
  const base = instanceUrl.replace(/\/$/, '');
  const pageSize = 50;
  const all: JiraComment[] = [];
  let startAt = 0;
  let total = Infinity;

  while (startAt < total) {
    const url = `${base}/rest/api/3/issue/${issueKeyOrId}/comment?maxResults=${pageSize}&startAt=${startAt}`;
    const response = await jiraFetch(
      url,
      {
        method: 'GET',
        headers: {
          Authorization: buildAuthHeader(email, token),
          Accept: 'application/json',
        },
      },
      `getIssueComments(${issueKeyOrId})`,
    );

    if (!response.ok) {
      throw new Error(
        `[getIssueComments] Jira returned HTTP ${response.status} for issue ${issueKeyOrId}.`
      );
    }

    const body = await response.json() as { comments: JiraComment[]; total: number };
    all.push(...(body.comments ?? []));
    total = body.total ?? 0;
    startAt += pageSize;
    if (all.length >= total) break;
  }

  return all;
}

/**
 * Fetches a single Jira issue by key or ID.
 */
export async function getIssue(
  instanceUrl: string,
  email: string,
  token: string,
  issueKeyOrId: string,
): Promise<JiraIssue> {
  const base = instanceUrl.replace(/\/$/, '');
  const url = `${base}/rest/api/3/issue/${issueKeyOrId}`;

  const response = await jiraFetch(
    url,
    {
      method: 'GET',
      headers: {
        Authorization: buildAuthHeader(email, token),
        Accept: 'application/json',
      },
    },
    `getIssue(${issueKeyOrId})`,
  );

  if (response.status === 404) {
    throw new Error(`[getIssue] Issue ${issueKeyOrId} not found in Jira.`);
  }
  if (!response.ok) {
    throw new Error(`[getIssue] Jira returned HTTP ${response.status} for issue ${issueKeyOrId}.`);
  }

  return response.json() as Promise<JiraIssue>;
}

/**
 * Registers the ORBIT inbound webhook in Jira.
 * Returns the Jira-assigned webhook ID (stored in jira_connections.webhook_id).
 */
export async function registerWebhook(
  instanceUrl: string,
  email: string,
  token: string,
  callbackUrl: string,
  secret: string,
): Promise<string> {
  const base = instanceUrl.replace(/\/$/, '');
  const url = `${base}/rest/api/3/webhook`;

  const body = {
    url: callbackUrl,
    webhooks: [
      {
        events: [
          'jira:issue_created',
          'jira:issue_updated',
          'jira:issue_deleted',
          'comment_created',
        ],
      },
    ],
  };

  const response = await jiraFetch(
    url,
    {
      method: 'POST',
      headers: {
        Authorization: buildAuthHeader(email, token),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    },
    'registerWebhook',
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `[registerWebhook] Jira returned HTTP ${response.status} when registering webhook. ` +
      `Detail: ${errorText}. Ensure the API token has Administer Jira permission.`
    );
  }

  const result = await response.json() as {
    webhookRegistrationResult?: Array<{ createdWebhookId?: number; errors?: string[] }>;
  };

  const first = result.webhookRegistrationResult?.[0];
  if (!first || first.errors?.length) {
    throw new Error(
      `[registerWebhook] Jira rejected the webhook registration: ${JSON.stringify(first?.errors)}`
    );
  }

  if (!first.createdWebhookId) {
    throw new Error('[registerWebhook] Jira did not return a webhook ID in the response.');
  }

  return String(first.createdWebhookId);
}

/**
 * Deregisters the ORBIT webhook from Jira by webhook ID.
 */
export async function deregisterWebhook(
  instanceUrl: string,
  email: string,
  token: string,
  webhookId: string,
): Promise<void> {
  const base = instanceUrl.replace(/\/$/, '');
  // Jira DELETE webhook requires the webhookId in the query string as an array
  const url = `${base}/rest/api/3/webhook?webhookIds=${webhookId}`;

  const response = await jiraFetch(
    url,
    {
      method: 'DELETE',
      headers: {
        Authorization: buildAuthHeader(email, token),
        Accept: 'application/json',
      },
    },
    `deregisterWebhook(${webhookId})`,
  );

  if (response.status === 404) {
    // Webhook already gone — treat as success
    return;
  }
  if (!response.ok) {
    throw new Error(
      `[deregisterWebhook] Jira returned HTTP ${response.status} when deregistering webhook ${webhookId}.`
    );
  }
}
