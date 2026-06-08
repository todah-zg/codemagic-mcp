import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

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


const transport = new StdioServerTransport();
await server.connect(transport);