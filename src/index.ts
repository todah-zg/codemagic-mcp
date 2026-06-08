import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { listApplications, listBuilds, getBuild } from "./codemagic.js";
import { z } from "zod";


const apiToken = process.env.CODEMAGIC_API_TOKEN;
if (!apiToken) {
    console.error("Error: CODEMAGIC_API_TOKEN environment variable is not set.");
    process.exit(1);
}


const server = new McpServer({
    name: "codemagic-mcp",
    description: "A MCP server for Codemagic",
    version: "0.1.0",
});

server.registerTool("ping", {
    description: "Check that the server is alive",
}, async () => {
  return {
    content: [{ type: "text", text: "Codemagic MCP server is running." }]
  };
});

server.registerTool("list_applications", {
    description: "List all applications in your Codemagic account",
    inputSchema: {
        team_id: z.string().optional().describe("Team ID to list apps for. If omitted, lists apps for the authenticated user."),
    },
}, async ({ team_id }) => {
    const apps = await listApplications(apiToken, team_id);
    const text = apps.map(app => `${app.name} (${app.id})`).join("\n");
    return {
        content: [{ type: "text", text }],
    };
});

server.registerTool("list_builds", {
    description: "List builds for a team, with optional filters",
    inputSchema: {
        team_id: z.string().describe("The team ID to list builds for"),
        app_id: z.string().optional().describe("Filter by Application ID"),
        status: z.enum(["queued", "building", "finished", "failed", "canceled", "timeout", "skipped"]).optional().describe("Filter by build status"),
        branch: z.string().optional().describe("Filter by git branch"),
        workflow_id: z.string().optional().describe("Filter by workflow ID"),
    },
}, async ({ team_id, app_id, status, branch, workflow_id }) => {
    const builds = await listBuilds(apiToken, team_id, { app_id, status, branch, workflow_id });
    const text = builds.map(b => `#${b.index} ${b.status} - ${b.branch ?? b.tag ?? "no branch"} (${b.id})`).join("\n");
    return {
        content: [{ type: "text", text : text || "No builds found." }],
    };
});

server.registerTool("get_build", {
    description: "Get full details for a single build, including artifacts",
    inputSchema: {
        build_id: z.string().describe("The build ID"),
    },
}, async ({ build_id }) => {
    const build = await getBuild(apiToken, build_id);
    const artifactLines = build.artifacts.map(a => ` - ${a.name} (${a.type}, ${a.size_in_bytes} bytes)\n (${a.short_lived_download_url})`).join("\n");
    const text = [
        `Build #${build.index} - ${build.status}`,
        `Branch: ${build.branch ?? build.tag ?? "none"}`,
        `Created: ${build.created_at}`,
        `Started: ${build.started_at ?? "not started"}`,
        `Finished: ${build.finished_at ?? "not finished"}`,
        `Artifacts:\n${artifactLines || "No artifacts"}`,
    ].join("\n");
    return {
        content: [{ type: "text", text }],
    };
});


const transport = new StdioServerTransport();
await server.connect(transport);