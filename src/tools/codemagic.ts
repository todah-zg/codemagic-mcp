import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listApplications, listBuilds, getBuild, triggerBuild, listWorkflows, addApplication, waitForBuild, listVariableGroups, createVariableGroup, addVariable } from "../codemagic.js";


export function registerCodemagicTools(server: McpServer, apiToken: string): void {

  server.registerTool("ping", {
    description: "Check that the server is alive",
  }, async () => {
    return {
      content: [{ type: "text", text: "Codemagic MCP server is running." }],
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

  server.registerTool("list_workflows", {
    description: "List workflows for an application. Note: yaml-defined workflows only appear after their first build has run.",
    inputSchema: {
      app_id: z.string().describe("The application ID"),
    },
  }, async ({ app_id }) => {
    const workflows = await listWorkflows(apiToken, app_id);
    const text = workflows.map(w => `${w.name} (${w.id})`).join("\n");
    return {
      content: [{ type: "text", text: text || "No workflows found." }],
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
      content: [{ type: "text", text: text || "No builds found." }],
    };
  });

  server.registerTool("get_build", {
    description: "Get full details for a single build, including artifacts",
    inputSchema: {
      build_id: z.string().describe("The build ID"),
    },
  }, async ({ build_id }) => {
    const build = await getBuild(apiToken, build_id);
    const artifactLines = build.artifacts.map(a =>
      ` - ${a.name} (${a.type}, ${a.size_in_bytes} bytes)\n   ${a.short_lived_download_url}`
    ).join("\n");
    const text = [
      `Build #${build.index} - ${build.status}`,
      `Branch: ${build.branch ?? build.tag ?? "none"}`,
      `Created: ${build.created_at}`,
      `Started: ${build.started_at ?? "not started"}`,
      `Finished: ${build.finished_at ?? "not finished"}`,
      `Artifacts:\n${artifactLines || "  none"}`,
    ].join("\n");
    return {
      content: [{ type: "text", text }],
    };
  });

  server.registerTool("trigger_build", {
    description: "Trigger a new build on Codemagic. Requires an existing workflow defined in the repository's codemagic.yaml or in the Codemagic UI.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
    inputSchema: {
      app_id: z.string().describe("The application ID"),
      workflow_id: z.string().describe("The workflow ID to run"),
      branch: z.string().optional().describe("Git branch to build"),
      tag: z.string().optional().describe("Git tag to build"),
      variables: z.record(z.string(), z.string()).optional().describe("Environment variables to inject into the build"),
      groups: z.array(z.string()).optional().describe("Environment variable groups to include"),
      labels: z.array(z.string()).optional().describe("Labels to attach to the build"),
      yaml_content: z.string().optional().describe("A codemagic.yaml file content to use for this build. When provided, the yaml is passed inline and does not need to exist in the repository."),
    },
  }, async ({ app_id, workflow_id, branch, tag, variables, groups, labels, yaml_content }) => {
    if (!branch && !tag) {
      return {
        content: [{ type: "text", text: "Error: either branch or tag must be provided." }],
        isError: true,
      };
    }
    const buildId = await triggerBuild(apiToken, {
      appId: app_id,
      workflowId: workflow_id,
      branch,
      tag,
      environment: { variables, groups },
      labels: labels ?? [],
    }, yaml_content);
    return {
      content: [{ type: "text", text: `Build triggered successfully. Build ID: ${buildId}` }],
    };
  });

  server.registerTool("wait_for_build", {
    description: "Wait for a Codemagic build to complete. Polls until the build reaches a terminal state (finished, failed, canceled, timeout, skipped). Returns the final build details including artifacts.",
    inputSchema: {
      build_id: z.string().describe("The Codemagic build ID to wait for"),
      interval_seconds: z.number().optional().describe("How often to poll in seconds (default: 30)"),
    },
  }, async ({ build_id, interval_seconds }) => {
    const build = await waitForBuild(apiToken, build_id, interval_seconds);
    const artifactLines = build.artifacts.map(a =>
      `  - ${a.name} (${a.type})\n    ${a.short_lived_download_url}`
    ).join("\n");
    const text = [
      `Build #${build.index} — ${build.status}`,
      `Branch: ${build.branch ?? build.tag ?? "none"}`,
      `Finished: ${build.finished_at ?? "unknown"}`,
      `Artifacts:\n${artifactLines || "  none"}`,
    ].join("\n");
    return {
      content: [{ type: "text", text }],
      isError: build.status !== "finished",
    };
  });

  server.registerTool("add_application", {
    description: "Add a new application to Codemagic by connecting a Git repository. Note: after adding, the app will show 'Set up build' in the Codemagic UI — this is expected. Builds can still be triggered via API using workflow IDs defined in the repository's codemagic.yaml.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
    inputSchema: {
      repository_url: z.string().describe("SSH or HTTPS URL of the Git repository"),
      team_id: z.string().optional().describe("Team ID to add the app to"),
      ssh_key: z.string().optional().describe("Base64-encoded SSH private key for private repositories"),
      ssh_passphrase: z.string().optional().describe("SSH key passphrase, if the key has one"),
    },
  }, async ({ repository_url, team_id, ssh_key, ssh_passphrase }) => {
    const sshKey = ssh_key
      ? { data: ssh_key, passphrase: ssh_passphrase ?? null }
      : undefined;
    const app = await addApplication(apiToken, repository_url, team_id, sshKey);
    return {
      content: [{ type: "text", text: `Application added: ${app.appName} (${app.id})` }],
    };
  });

  server.registerTool("list_variable_groups", {
    description: "List variable groups for a team or app in Codemagic. Use group names to reference them in trigger_build. Secret values are never returned — manage secrets directly in the Codemagic UI.",
    inputSchema: {
      team_id: z.string().optional().describe("Team ID to list groups for"),
      app_id: z.string().optional().describe("App ID to list groups for"),
    },
  }, async ({ team_id, app_id }) => {
    if (!team_id && !app_id) {
      return {
        content: [{ type: "text", text: "Error: either team_id or app_id must be provided." }],
        isError: true,
      };
    }
    const groups = await listVariableGroups(apiToken, team_id, app_id);
    const text = groups.map(g => `${g.name} (${g.id})`).join("\n");
    return {
      content: [{ type: "text", text: text || "No variable groups found." }],
    };
  });

  server.registerTool("create_variable_group", {
    description: "Create a new variable group in Codemagic. Requires a team_id (personal accounts do not support global variable groups) or an app_id for app-level groups. After creating, add non-secret variables via add_variable, or add secret values directly in the Codemagic UI.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
    inputSchema: {
      name: z.string().describe("Name of the variable group"),
      team_id: z.string().optional().describe("Team ID to create the group under"),
      app_id: z.string().optional().describe("App ID to create the group under"),
    },
  }, async ({ name, team_id, app_id }) => {
    if (!team_id && !app_id) {
      return {
        content: [{ type: "text", text: "Error: either team_id or app_id must be provided." }],
        isError: true,
      };
    }
    const group = await createVariableGroup(apiToken, name, team_id, app_id);
    return {
      content: [{ type: "text", text: `Variable group created: ${group.name} (${group.id})` }],
    };
  });

  server.registerTool("add_variable", {
    description: "Add a non-secret variable to a Codemagic variable group. For secret values (API keys, certificates, tokens) use the Codemagic UI instead — secrets should never pass through the agent.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
    inputSchema: {
      group_id: z.string().describe("The variable group ID to add the variable to"),
      name: z.string().describe("Variable name, e.g. FLUTTER_VERSION"),
      value: z.string().describe("Variable value"),
    },
  }, async ({ group_id, name, value }) => {
    await addVariable(apiToken, group_id, name, value);
    return {
      content: [{ type: "text", text: `Variable ${name} added to group ${group_id}.` }],
    };
  });

}