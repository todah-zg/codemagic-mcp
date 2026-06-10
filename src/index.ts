#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerCodemagicTools } from "./tools/codemagic.js";
import { registerAscTools } from "./tools/asc.js";
import { registerGooglePlayTools } from "./tools/googleplay.js";
import { registerYamlTools } from "./tools/yaml.js";
import { registerPrompts } from "./prompts.js";

// Validate required credentials
const apiToken = process.env.CODEMAGIC_API_TOKEN;
if (!apiToken) {
  console.error("Error: CODEMAGIC_API_TOKEN environment variable is not set.");
  process.exit(1);
}

// ASC credentials — optional, but warn if partial
const ascVars = ["ASC_KEY_ID", "ASC_ISSUER_ID", "ASC_PRIVATE_KEY_B64"];
const missingAsc = ascVars.filter(v => !process.env[v]);
if (missingAsc.length > 0 && missingAsc.length < ascVars.length) {
  console.error(`Warning: partial ASC configuration — missing: ${missingAsc.join(", ")}. App Store Connect tools will fail.`);
} else if (missingAsc.length === ascVars.length) {
  console.error("Warning: ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY_B64 are not set. App Store Connect tools will not work.");
}

// Google Play credentials — optional, warn if missing
if (!process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_CREDENTIALS) {
  console.error("Warning: GOOGLE_PLAY_SERVICE_ACCOUNT_CREDENTIALS is not set. Google Play tools will not work.");
}

// Server setup
const server = new McpServer({
  name: "codemagic-mcp",
  description: "MCP server for Codemagic CI/CD, App Store Connect, and Google Play",
  version: "0.1.1",
});

// Register tools by domain
registerCodemagicTools(server, apiToken);
registerAscTools(server);
registerGooglePlayTools(server);
registerYamlTools(server);
registerPrompts(server);
// Start
const transport = new StdioServerTransport();
await server.connect(transport);