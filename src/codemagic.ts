const BASE_URL_V3 = "https://codemagic.io";
const BASE_URL_V1 = "https://api.codemagic.io";

const FETCH_TIMEOUT_MS = 10_000;

async function buildApiError(response: Response): Promise<Error> {
  const body = await response.text().catch(() => "");
  const detail = body ? ` — ${body.slice(0, 200)}` : "";
  return new Error(`Codemagic API error: ${response.status} ${response.statusText}${detail}`);
}

export interface Application {
  id: string;
  name: string;
  icon_url: string;
  last_build_id: string;
  archived: boolean;
}

/**
 * List applications in a Codemagic team or personal account.
 * @param apiToken - Codemagic API token from User settings → Integrations.
 * @param teamId - Optional team ID. If omitted, returns apps for the authenticated user.
 */
export async function listApplications(apiToken: string, teamId?: string): Promise<Application[]> {
  const path = teamId
    ? `/api/v3/teams/${teamId}/apps`
    : `/api/v3/user/apps`;
  const response = await fetch(`${BASE_URL_V3}${path}`, {
    headers: { "x-auth-token": apiToken },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw await buildApiError(response);
  const data = await response.json() as { data: Application[] };
  return data.data;
}

export interface Team {
  id: string;
  name: string;
}

/**
 * List teams the authenticated user belongs to.
 * Use the returned team IDs with list_applications, list_builds, and other team-scoped tools.
 * @param apiToken - Codemagic API token.
 */
export async function listTeams(apiToken: string): Promise<Team[]> {
  const response = await fetch(`${BASE_URL_V3}/api/v3/user/teams`, {
    headers: { "x-auth-token": apiToken },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw await buildApiError(response);
  const data = await response.json() as { data: Array<{ id: string; name: string }> };
  return data.data.map(t => ({ id: t.id, name: t.name }));
}

export interface Artifact {
  name: string;
  type: string;
  size_in_bytes: number;
  /** Short-lived download URL. Valid for ~2 hours after build completion. */
  short_lived_download_url: string;
  version_name: string | null;
  version_code: string | null;
}

export interface Build {
  id: string;
  app_id: string;
  status: string;
  index: number;
  branch: string | null;
  tag: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  artifacts: Artifact[];
}

/**
 * List builds for a team, with optional filters.
 * Uses the v3 API which is team-scoped — a teamId is always required.
 * @param apiToken - Codemagic API token.
 * @param teamId - Team ID to list builds for.
 * @param filters - Optional filters for app, status, branch, or workflow.
 */
export async function listBuilds(
  apiToken: string,
  teamId: string,
  filters?: {
    app_id?: string;
    status?: string;
    branch?: string;
    workflow_id?: string;
  }
): Promise<Build[]> {
  const params = new URLSearchParams();
  if (filters?.app_id) params.set("app_id", filters.app_id);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.branch) params.set("branch", filters.branch);
  if (filters?.workflow_id) params.set("workflow_id", filters.workflow_id);

  const query = params.size > 0 ? `?${params}` : "";
  const response = await fetch(`${BASE_URL_V3}/api/v3/teams/${teamId}/builds${query}`, {
    headers: { "x-auth-token": apiToken },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw await buildApiError(response);
  const data = await response.json() as { data: Build[] };
  return data.data;
}

/**
 * Get full details for a single build, including its artifacts.
 * @param apiToken - Codemagic API token.
 * @param buildId - The build ID.
 */
export async function getBuild(apiToken: string, buildId: string): Promise<Build> {
  const response = await fetch(`${BASE_URL_V3}/api/v3/builds/${buildId}`, {
    headers: { "x-auth-token": apiToken },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw await buildApiError(response);
  const data = await response.json() as { data: Build };
  return data.data;
}

export interface TriggerBuildParams {
  appId: string;
  workflowId: string;
  branch?: string;
  tag?: string;
  environment?: {
    variables?: Record<string, string>;
    groups?: string[];
  };
  labels: string[];
  instanceType?: string;
}

/**
 * Trigger a new build on Codemagic.
 * Either `branch` or `tag` must be set in params.
 * @param apiToken - Codemagic API token.
 * @param params - Build parameters including app, workflow, branch/tag, and environment.
 * @param yamlContent - Optional inline codemagic.yaml. When provided, sent as a
 *   multipart form upload and overrides any yaml in the repository.
 * @returns The new build ID.
 */
export async function triggerBuild(
  apiToken: string,
  params: TriggerBuildParams,
  yamlContent?: string
): Promise<string> {
  let body: BodyInit;
  const headers: Record<string, string> = { "x-auth-token": apiToken };

  if (yamlContent) {
    const form = new FormData();
    form.append("data", JSON.stringify(params));
    form.append("config", new Blob([yamlContent], { type: "text/plain" }), "codemagic.yaml");
    body = form;
  } else {
    body = JSON.stringify(params);
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${BASE_URL_V1}/builds`, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw await buildApiError(response);
  const data = await response.json() as { buildId: string };
  return data.buildId;
}

export interface Workflow {
  id: string;
  name: string;
}

/**
 * Cancel a running or queued build.
 * Has no effect on builds that have already reached a terminal state.
 * @param apiToken - Codemagic API token.
 * @param buildId - The build ID to cancel.
 */
export async function cancelBuild(apiToken: string, buildId: string): Promise<void> {
  const response = await fetch(`${BASE_URL_V1}/builds/${buildId}/cancel`, {
    method: "POST",
    headers: { "x-auth-token": apiToken },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw await buildApiError(response);
}


/**
 * List workflows defined for an application.
 * Note: workflows defined in codemagic.yaml only appear here after their first build has run.
 * @param apiToken - Codemagic API token.
 * @param appId - The application ID.
 */
export async function listWorkflows(apiToken: string, appId: string): Promise<Workflow[]> {
  const response = await fetch(`${BASE_URL_V1}/apps/${appId}`, {
    headers: { "x-auth-token": apiToken },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw await buildApiError(response);
  const data = await response.json() as {
    application: {
      workflows: Record<string, { name: string }>;
    };
  };
  return Object.entries(data.application.workflows).map(([id, workflow]) => ({
    id,
    name: workflow.name,
  }));
}

/**
 * Connect a Git repository to Codemagic as a new application.
 * After adding, the app shows "Set up build" in the UI — this is expected.
 * Builds can still be triggered via API using workflow IDs from codemagic.yaml.
 * @param apiToken - Codemagic API token.
 * @param repositoryUrl - SSH or HTTPS URL of the Git repository.
 * @param teamId - Optional team to add the app to.
 * @param sshKey - Required for private repositories not accessible via HTTPS.
 */
export async function addApplication(
  apiToken: string,
  repositoryUrl: string,
  teamId?: string,
  sshKey?: { data: string; passphrase: string | null }
): Promise<{ id: string; appName: string }> {
  const endpoint = sshKey ? `${BASE_URL_V1}/apps/new` : `${BASE_URL_V1}/apps`;
  const body: Record<string, unknown> = { repositoryUrl };
  if (teamId) body.teamId = teamId;
  if (sshKey) body.sshKey = sshKey;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "x-auth-token": apiToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw await buildApiError(response);

  const data = await response.json() as { application?: { _id: string; appName: string }; _id?: string; appName?: string };
  const id = data.application?._id ?? data._id;
  const appName = data.application?.appName ?? data.appName;
  if (!id || !appName) {
    throw new Error(`add_application: unexpected response shape — ${JSON.stringify(data)}`);
  }
  return { id, appName };
}

/** Terminal build statuses — a build in one of these states will not progress further. */
export const TERMINAL_STATUSES = new Set(["finished", "failed", "canceled", "timeout", "skipped"]);

/**
 * Poll a build until it reaches a terminal state, then return it.
 * Caution: this blocks for the full duration of the build.
 * @param apiToken - Codemagic API token.
 * @param buildId - The build ID to wait for.
 * @param intervalSeconds - Polling interval in seconds. Default is 30.
 */
/**
 * Check the current status of a build. Returns immediately — no polling loop.
 * The caller is responsible for re-invoking until a terminal status is reached.
 * Use TERMINAL_STATUSES to check whether the returned build has finished.
 * @param apiToken - Codemagic API token.
 * @param buildId - The build ID to check.
 */
export async function waitForBuild(apiToken: string, buildId: string): Promise<Build> {
  return getBuild(apiToken, buildId);
}

export interface VariableGroup {
  id: string;
  name: string;
}

export interface Variable {
  id: string;
  name: string;
  value: string | null;
  secure: boolean;
}

/**
 * List variable groups for a team or app.
 * Secret variable values are not returned by the API — manage them in the Codemagic UI.
 * @param apiToken - Codemagic API token.
 * @param teamId - Team ID (mutually exclusive with appId).
 * @param appId - App ID for app-scoped groups (mutually exclusive with teamId).
 */
export async function listVariableGroups(
  apiToken: string,
  teamId?: string,
  appId?: string
): Promise<VariableGroup[]> {
  const path = teamId
    ? `/api/v3/teams/${teamId}/variable-groups`
    : `/api/v3/apps/${appId}/variable-groups`;
  const response = await fetch(`${BASE_URL_V3}${path}`, {
    headers: { "x-auth-token": apiToken },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw await buildApiError(response);
  const data = await response.json() as { data: VariableGroup[] };
  return data.data;
}

/**
 * List variables in a variable group.
 * Secret variable values are returned as null — only non-secret values are visible.
 * The returned variable IDs are required for update_variable and delete_variable.
 * @param apiToken - Codemagic API token.
 * @param groupId - The variable group ID.
 */
export async function listVariables(apiToken: string, groupId: string): Promise<Variable[]> {
  const response = await fetch(`${BASE_URL_V3}/api/v3/variable-groups/${groupId}/variables`, {
    headers: { "x-auth-token": apiToken },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw await buildApiError(response);
  const data = await response.json() as { data: Variable[] };
  return data.data;
}

/**
 * Create a new variable group for a team or app.
 * Team-level groups require advanced_security settings — this function defaults to disabled.
 * Personal accounts do not support team-level variable groups.
 * @param apiToken - Codemagic API token.
 * @param name - Name of the new group.
 * @param teamId - Team ID (mutually exclusive with appId).
 * @param appId - App ID for app-scoped groups (mutually exclusive with teamId).
 */
export async function createVariableGroup(
  apiToken: string,
  name: string,
  teamId?: string,
  appId?: string
): Promise<VariableGroup> {
  const path = teamId
    ? `/api/v3/teams/${teamId}/variable-groups`
    : `/api/v3/apps/${appId}/variable-groups`;
  const body: Record<string, unknown> = { name };
  if (teamId) {
    body.advanced_security = { enabled: false, selected_apps: [] };
  }
  const response = await fetch(`${BASE_URL_V3}${path}`, {
    method: "POST",
    headers: {
      "x-auth-token": apiToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw await buildApiError(response);
  const data = await response.json() as { data: VariableGroup };
  return data.data;
}

/**
 * Add a non-secret variable to a variable group.
 * Variables are always created with secure: false. For secret values,
 * use the Codemagic UI — secrets should never pass through the agent.
 * @param apiToken - Codemagic API token.
 * @param groupId - The variable group ID.
 * @param name - Variable name, e.g. FLUTTER_VERSION.
 * @param value - Variable value.
 */
export async function addVariable(
  apiToken: string,
  groupId: string,
  name: string,
  value: string
): Promise<void> {
  const response = await fetch(`${BASE_URL_V3}/api/v3/variable-groups/${groupId}/variables`, {
    method: "POST",
    headers: {
      "x-auth-token": apiToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      secure: false,
      variables: [{ name, value }],
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw await buildApiError(response);
}

/**
 * Update an existing variable in a variable group.
 * Only non-secure variables should be updated via the agent — manage secret
 * values directly in the Codemagic UI.
 * @param apiToken - Codemagic API token.
 * @param groupId - The variable group ID.
 * @param variableId - The variable ID to update (from list_variable_groups).
 * @param name - New variable name.
 * @param value - New variable value.
 */
export async function updateVariable(
  apiToken: string,
  groupId: string,
  variableId: string,
  name: string,
  value: string
): Promise<void> {
  const response = await fetch(`${BASE_URL_V3}/api/v3/variable-groups/${groupId}/variables/${variableId}`, {
    method: "PATCH",
    headers: { "x-auth-token": apiToken, "Content-Type": "application/json" },
    body: JSON.stringify({ name, value, secure: false }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw await buildApiError(response);
}

/**
 * Delete a variable from a variable group.
 * @param apiToken - Codemagic API token.
 * @param groupId - The variable group ID.
 * @param variableId - The variable ID to delete (from list_variable_groups).
 */
export async function deleteVariable(
  apiToken: string,
  groupId: string,
  variableId: string
): Promise<void> {
  const response = await fetch(`${BASE_URL_V3}/api/v3/variable-groups/${groupId}/variables/${variableId}`, {
    method: "DELETE",
    headers: { "x-auth-token": apiToken },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw await buildApiError(response);
}

export interface Cache {
  id: string;
  workflowId: string;
  lastUsed: string;
  size: number;
}

/**
 * List all build caches for an application.
 * Uses the v1 API — not in the v3 OpenAPI schema.
 * @param apiToken - Codemagic API token.
 * @param appId - The Codemagic app ID.
 */
export async function listCaches(apiToken: string, appId: string): Promise<Cache[]> {
  const response = await fetch(`${BASE_URL_V1}/apps/${appId}/caches`, {
    headers: { "x-auth-token": apiToken },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw await buildApiError(response);
  const data = await response.json() as { caches: Array<{ _id: string; workflowId: string; lastUsed: string; size: number }> };
  return data.caches.map(c => ({ id: c._id, workflowId: c.workflowId, lastUsed: c.lastUsed, size: c.size }));
}

/**
 * Delete one or all build caches for an application. Deletion is async — the
 * API returns 202 Accepted and completes in the background.
 * Uses the v1 API — not in the v3 OpenAPI schema.
 * @param apiToken - Codemagic API token.
 * @param appId - The Codemagic app ID.
 * @param cacheId - Specific cache ID to delete. If omitted, all caches are deleted.
 */
export async function deleteCache(apiToken: string, appId: string, cacheId?: string): Promise<string[]> {
  const url = cacheId
    ? `${BASE_URL_V1}/apps/${appId}/caches/${cacheId}`
    : `${BASE_URL_V1}/apps/${appId}/caches`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: { "x-auth-token": apiToken },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw await buildApiError(response);
  const data = await response.json() as { caches: string[] };
  return data.caches;
}

// ─── Webhooks ────────────────────────────────────────────────────────────────

export interface Webhook {
  _id: string;
  appId: string;
  url: string;
  events: string[];
  branchPatterns?: string[];
}

/**
 * Get the incoming webhook URL for a Codemagic app.
 * This is the URL you add to your Git provider (GitHub/GitLab/Bitbucket)
 * to trigger builds automatically on push or pull request events.
 * No API call is needed — the URL is derived from the app ID.
 * @param appId - The Codemagic app ID.
 * @returns The webhook URL to configure in the Git provider.
 */
export function getWebhookUrl(appId: string): string {
  return `https://api.codemagic.io/hooks/${appId}`;
}

/**
 * List all webhook subscriptions for a Codemagic app.
 * @param apiToken - Codemagic API token.
 * @param appId - The Codemagic app ID.
 */
export async function listWebhooks(apiToken: string, appId: string): Promise<Webhook[]> {
  const response = await fetch(`https://api.codemagic.io/apps/${appId}/webhooks`, {
    headers: { "x-auth-token": apiToken },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw await buildApiError(response);
  return response.json() as Promise<Webhook[]>;
}

/**
 * Delete a webhook subscription from a Codemagic app.
 * @param apiToken - Codemagic API token.
 * @param appId - The Codemagic app ID.
 * @param webhookId - The webhook ID to delete.
 */
export async function deleteWebhook(apiToken: string, appId: string, webhookId: string): Promise<void> {
  const response = await fetch(`https://api.codemagic.io/apps/${appId}/webhooks/${webhookId}`, {
    method: "DELETE",
    headers: { "x-auth-token": apiToken },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw await buildApiError(response);
}

export interface BuildAction {
  id: string;
  name: string;
  type: string;
  status: string | null;
}

/**
 * List all build steps (actions) for a build, including their status and timing.
 * The returned IDs are used with getStepLog to fetch log text for individual steps.
 * Uses the v3 API — no log content is returned here, only metadata.
 * @param apiToken - Codemagic API token.
 * @param buildId - The build ID.
 */
export async function getBuildActions(apiToken: string, buildId: string): Promise<BuildAction[]> {
  const response = await fetch(`${BASE_URL_V3}/api/v3/builds/${buildId}/actions`, {
    headers: { "x-auth-token": apiToken },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw await buildApiError(response);
  const data = await response.json() as { data: BuildAction[] };
  return data.data;
}

/**
 * Fetch the plain-text log for a single build step.
 * Uses the v1 API (api.codemagic.io) — this endpoint is not in the v3 OpenAPI schema
 * but accepts the same x-auth-token authentication.
 * @param apiToken - Codemagic API token.
 * @param buildId - The build ID.
 * @param stepId - The step ID from getBuildActions.
 */
export async function getStepLog(apiToken: string, buildId: string, stepId: string): Promise<string> {
  const response = await fetch(`${BASE_URL_V1}/builds/${buildId}/step/${stepId}`, {
    headers: { "x-auth-token": apiToken },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw await buildApiError(response);
  return response.text();
}