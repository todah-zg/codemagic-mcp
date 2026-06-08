import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { listApplications } from "./codemagic.js";
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

server.registerTool("list-applications", {
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

const transport = new StdioServerTransport();
await server.connect(transport);