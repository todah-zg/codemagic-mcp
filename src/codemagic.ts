const BASE_URL_V3 = "https://codemagic.io";
const BASE_URL_V1 = "https://api.codemagic.io";

export interface Application {
    id: string;
    name: string;
    icon_url: string;
    last_build_id: string;
    archived: boolean;
}

export async function listApplications(apiToken: string, teamId?: string): Promise<Application[]> {
    const path = teamId
        ? `/api/v3/teams/${teamId}/apps`
        : `/api/v3/user/apps`;
    const response = await fetch(`${BASE_URL_V3}${path}`, {
        headers: {"x-auth-token": apiToken },
    });

    if (!response.ok) {
        throw new Error(`Codemagic API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { data: Application[] };
    return data.data;
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

    const query = params.size > 0 ? `?{params}` : "";
    const response = await fetch(`${BASE_URL_V3}/api/v3/teams/${teamId}/builds${query}`, {
        headers: { "x-auth-token": apiToken },
    });

    if (!response.ok) {
        throw new Error(`Codemagic API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { data: Build[] };
    return data.data;
}

export async function getBuild(apiToken: string, buildId: string): Promise<Build> {
    const response = await fetch(`${BASE_URL_V3}/api/v3/builds/${buildId}`, {
        headers: { "x-auth-token": apiToken },
    });

    if (!response.ok) {
        throw new Error(`Codemagic API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { data: Build };
    return data.data;
}

export interface Artifact {
  name: string;
  type: string;
  size_in_bytes: number;
  short_lived_download_url: string;
  version_name: string | null;
  version_code: string | null;
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
}

export async function triggerBuild(apiToken: string, params: TriggerBuildParams): Promise<string> {
    const response = await fetch (`${BASE_URL_V1}/builds`, {
        method: "POST",
        headers: {
            "x-auth-token": apiToken,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
    });

    if (!response.ok) {
        throw new Error(`Codemagic API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { buildId: string };
    return data.buildId;
}