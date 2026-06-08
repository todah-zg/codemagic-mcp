import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { listApplications, listBuilds, getBuild, triggerBuild, listWorkflows, addApplication } from "./codemagic.js";
import { z } from "zod";
import { listAscApps, listAscBuilds, listTestFlightGroups, getReviewStatus, getReleaseStatus } from "./asc.js";
import { validateCodemagicYaml, getYamlTemplate, listYamlTemplateTypes } from "./yaml.js";


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
    },
}, async ({ app_id, workflow_id, branch, tag, variables, groups, labels }) => {
    if (!branch && !tag) {
        return {
            content: [{ type: "text", text: "Error: You must specify either a branch or a tag to build." }],
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
    });
    return {
        content: [{ type: "text", text: `Build triggered successfully. Build ID: ${buildId}` }],
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


server.registerTool("list_asc_apps", {
  description: "List applications in App Store Connect",
}, async () => {
  const apps = await listAscApps();
  const text = apps.map(app => `${app.name} (${app.bundleId}) — ID: ${app.id}`).join("\n");
  return {
    content: [{ type: "text", text: text || "No apps found." }],
  };
});

server.registerTool("list_asc_builds", {
  description: "List TestFlight builds for an app in App Store Connect",
  inputSchema: {
    app_id: z.string().describe("The App Store Connect app ID"),
  },
}, async ({ app_id }) => {
  const builds = await listAscBuilds(app_id);
  const text = builds.map(b =>
    `v${b.version} — ${b.processingState}${b.expired ? " (expired)" : ""} — uploaded ${b.uploadedDate} (${b.id})`
  ).join("\n");
  return {
    content: [{ type: "text", text: text || "No builds found." }],
  };
});

server.registerTool("list_testflight_groups", {
  description: "List TestFlight beta groups for an app",
  inputSchema: {
    app_id: z.string().describe("The App Store Connect app ID"),
  },
}, async ({ app_id }) => {
  const groups = await listTestFlightGroups(app_id);
  const text = groups.map(g =>
    `${g.name} — ${g.isInternalGroup ? "internal" : "external"} (${g.id})`
  ).join("\n");
  return {
    content: [{ type: "text", text: text || "No groups found." }],
  };
});

server.registerTool("get_review_status", {
  description: "Get the App Store review status for an app",
  inputSchema: {
    app_id: z.string().describe("The App Store Connect app ID"),
  },
}, async ({ app_id }) => {
  const status = await getReviewStatus(app_id);
  const lines = [
    `Review state: ${status.reviewState}`,
    `Version: ${status.version?.version ?? "none"} (${status.version?.state ?? "unknown"})`,
    `Next action: ${status.nextAction}`,
  ];
  if (status.blockers.length > 0) {
    lines.push(`Blockers:\n${status.blockers.map(b => `  - ${b}`).join("\n")}`);
  }
  return {
    content: [{ type: "text", text: lines.join("\n") }],
  };
});


server.registerTool("get_release_status", {
  description: "Get a full release pipeline status dashboard for an app, including latest build, TestFlight, App Store version, and submission state",
  inputSchema: {
    app_id: z.string().describe("The App Store Connect app ID"),
  },
}, async ({ app_id }) => {
  const status = await getReleaseStatus(app_id);
  const lines = [
    `${status.app.name} (${status.app.bundleId})`,
    `Health: ${status.summary.health.toUpperCase()}`,
    `Next action: ${status.summary.nextAction}`,
    ``,
    `Latest build: ${status.builds.latest ? `v${status.builds.latest.version} build ${status.builds.latest.buildNumber} — ${status.builds.latest.processingState}` : "none"}`,
    `TestFlight: ${status.testflight ? `${status.testflight.betaReviewState}` : "not submitted"}`,
    `App Store: ${status.appstore ? `v${status.appstore.version} — ${status.appstore.state}` : "none"}`,
    `Submission in flight: ${status.submission.inFlight ? "yes" : "no"}`,
  ];
  if (status.summary.blockers.length > 0) {
    lines.push(`\nBlockers:\n${status.summary.blockers.map(b => `  - ${b}`).join("\n")}`);
  }
  return {
    content: [{ type: "text", text: lines.join("\n") }],
  };
});


server.registerTool("validate_codemagic_yaml", {
  description: "Validate a codemagic.yaml file against the official Codemagic JSON schema",
  inputSchema: {
    yaml_content: z.string().describe("The full contents of a codemagic.yaml file"),
  },
}, async ({ yaml_content }) => {
  const result = await validateCodemagicYaml(yaml_content);
  if (result.valid) {
    return {
      content: [{ type: "text", text: "Valid codemagic.yaml — no errors found." }],
    };
  }
  const text = `Invalid codemagic.yaml — ${result.errors.length} error(s):\n${result.errors.map(e => `  - ${e}`).join("\n")}`;
  return {
    content: [{ type: "text", text }],
    isError: true,
  };
});


server.registerTool("get_yaml_template", {
  description: "Get a starter codemagic.yaml template for a given project type. Templates cover build and signing only — publishing is handled separately via App Store Connect tools.",
  inputSchema: {
    project_type: z.enum([
      "flutter",
      "react-native",
      "ios",
      "android",
      "unity",
      "ionic-capacitor",
      "ionic-cordova",
    ]).describe("The project type to get a template for"),
  },
}, async ({ project_type }) => {
  const template = getYamlTemplate(project_type);
  if (!template) {
    return {
      content: [{ type: "text", text: `No template found for project type: ${project_type}` }],
      isError: true,
    };
  }
  return {
    content: [{ type: "text", text: template }],
  };
});



const transport = new StdioServerTransport();
await server.connect(transport);