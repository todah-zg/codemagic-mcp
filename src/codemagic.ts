const BASE_URL = "https://codemagic.io";

export async function listApplications(apiToken: string, teamId?: string): Promise<Application[]> {
    const path = teamId
        ? `/api/v3/teams/${teamId}/apps`
        : `/api/v3/user/apps`;
    const response = await fetch(`${BASE_URL}${path}`, {
        headers: {"x-auth-token": apiToken },
    });

    if (!response.ok) {
        throw new Error(`Codemagic API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { data: Application[] };
    return data.data;
}

export interface Application {
    id: string;
    name: string;
    icon_url: string;
    last_build_id: string;
    archived: boolean;
}
