import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listApplications, listBuilds, getBuild, triggerBuild, listWorkflows, addApplication, waitForBuild, listVariableGroups, createVariableGroup, addVariable, getWebhookUrl, listWebhooks, deleteWebhook } from "../codemagic.js";

export function registerCodemagicTools(server: McpServer, apiToken: string): void {

  server.registerTool("ping", {
    description: "Check that the server is alive",
  }, async () => {
    return {
      content: [{ type: "text", text: "Codemagic MCP server is running." }],
    };
  });

  server.registerTool("list_applications", {
    description: "List all applications in your Codemagic account. Call this first to get the app IDs needed by all other Codemagic tools.",
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
    description: "List workflows for an application. Returns workflow names and IDs — use the ID in trigger_build to run a specific workflow. Note: yaml-defined workflows only appear after their first build has run.",
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
    description: "List builds for a team with optional filters. Returns build IDs and status. Use get_build with a build ID to retrieve full details and artifact download URLs.",
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
    description: "Get full details for a single build including artifact download URLs. The build ID comes from trigger_build or list_builds. Artifact URLs are short-lived — use them promptly, or use wait_for_build which returns them automatically on completion.",
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
    description: "Trigger a new build on Codemagic. For release builds: determine BUILD_NUMBER first using list_asc_builds (iOS) or list_google_play_tracks (Android), then pass it in the variables parameter. Use yaml_content to supply an inline codemagic.yaml — get a starter template from get_yaml_template and validate it with validate_codemagic_yaml before triggering. Call wait_for_build with the returned build ID to wait for completion and retrieve artifact URLs.",
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
    description: "Wait for a Codemagic build to complete, polling until a terminal state is reached. Waits up to max_wait_seconds (default 55), then returns a 'still building' message — call again with the same build_id to continue polling. Returns final build details and artifact download URLs on completion.",
    inputSchema: {
      build_id: z.string().describe("The Codemagic build ID to wait for"),
      interval_seconds: z.number().optional().describe("How often to poll in seconds (default: 30)"),
      max_wait_seconds: z.number().optional().describe("Maximum seconds to wait before returning 'still building' (default: 55). Call again with the same build_id to resume polling."),
    },
  }, async ({ build_id, interval_seconds, max_wait_seconds }) => {
    const build = await waitForBuild(apiToken, build_id, interval_seconds, max_wait_seconds);
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
    description: "Add a new application to Codemagic by connecting a Git repository. For private repositories, use HTTPS with a token in the URL, or add the deploy key via the Codemagic UI after connecting. Note: after adding, the app shows 'Set up build' in the UI — this is expected.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
    inputSchema: {
      repository_url: z.string().describe("SSH or HTTPS URL of the Git repository"),
      team_id: z.string().optional().describe("Team ID to add the app to"),
    },
  }, async ({ repository_url, team_id }) => {
    const app = await addApplication(apiToken, repository_url, team_id);
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

  server.registerTool("get_webhook_url", {
    description: "Get the incoming webhook URL for a Codemagic app. Paste this URL into your Git provider (GitHub, GitLab, or Bitbucket) repository settings to trigger builds automatically on push or pull request events.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      app_id: z.string().describe("The Codemagic app ID"),
    },
  }, async ({ app_id }) => {
    const url = getWebhookUrl(app_id);
    return {
      content: [{ type: "text", text: `Webhook URL for app ${app_id}:\n${url}\n\nAdd this URL to your Git provider's repository webhook settings. Set the content type to application/json and select the push and pull request events you want to trigger builds.` }],
    };
  });

  server.registerTool("list_webhooks", {
    description: "List webhook subscriptions configured for a Codemagic app",
    annotations: { readOnlyHint: true },
    inputSchema: {
      app_id: z.string().describe("The Codemagic app ID"),
    },
  }, async ({ app_id }) => {
    const webhooks = await listWebhooks(apiToken, app_id);
    if (webhooks.length === 0) {
      return { content: [{ type: "text", text: "No webhooks configured for this app." }] };
    }
    return { content: [{ type: "text", text: JSON.stringify(webhooks, null, 2) }] };
  });

  server.registerTool("delete_webhook", {
    description: "Delete a webhook subscription from a Codemagic app",
    annotations: { destructiveHint: true },
    inputSchema: {
      app_id: z.string().describe("The Codemagic app ID"),
      webhook_id: z.string().describe("The webhook ID to delete (from list_webhooks)"),
    },
  }, async ({ app_id, webhook_id }) => {
    await deleteWebhook(apiToken, app_id, webhook_id);
    return { content: [{ type: "text", text: `Webhook ${webhook_id} deleted.` }] };
  });

}