import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listAscApps, listAscBuilds, listTestFlightGroups, getReviewStatus, getReleaseStatus, uploadToTestFlight } from "../asc.js";

export function registerAscTools(server: McpServer): void {

  server.registerTool("list_asc_apps", {
    description: "List apps in App Store Connect. Call this first to get the ASC app ID needed by all other App Store Connect tools.",
  }, async () => {
    const apps = await listAscApps();
    const text = apps.map(app => `${app.name} (${app.bundleId}) — ID: ${app.id}`).join("\n");
    return {
      content: [{ type: "text", text: text || "No apps found." }],
    };
  });

  server.registerTool("list_asc_builds", {
    description: "List TestFlight builds for an app in App Store Connect. Find the highest version number, increment by 1, and pass that as BUILD_NUMBER in trigger_build variables before triggering a release build.",
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
    description: "List TestFlight beta groups for an app. Use a group name from this list in the beta_group parameter of upload_to_testflight to distribute to testers automatically after upload.",
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

  server.registerTool("get_asc_review_status", {
    description: "Get the current App Store review status for an app. Call this after submitting to the App Store to monitor progress and check for blockers.",
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

  server.registerTool("get_asc_release_status", {
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

  server.registerTool("upload_to_testflight", {
    description: "Download an IPA artifact from Codemagic and upload it to TestFlight via App Store Connect. Optionally distribute to a beta group after upload.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
    inputSchema: {
      app_id: z.string().describe("The App Store Connect app ID"),
      ipa_url: z.string().describe("The IPA download URL from a Codemagic build artifact"),
      beta_group: z.string().optional().describe("TestFlight beta group name to distribute to after upload"),
    },
  }, async ({ app_id, ipa_url, beta_group }) => {
    const result = await uploadToTestFlight(app_id, ipa_url, beta_group);
    return {
      content: [{ type: "text", text: `Upload complete.\n${result}` }],
    };
  });

}