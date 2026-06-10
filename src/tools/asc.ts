import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listAscApps, listAscBuilds, listTestFlightGroups, getReviewStatus, getReleaseStatus, uploadToTestFlight, publishToAppStore, validateAppSubmission, setVersionMetadata, setExportCompliance, releaseVersion, setPhasedRelease, submitBetaReview, addTestFlightTester, createTestFlightGroup } from "../asc.js";

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

  server.registerTool("validate_app_submission", {
    description:
      "Run a preflight readiness check for an App Store version before submitting for review. " +
      "Checks metadata completeness, build attachment, export compliance, pricing, screenshots, and more. " +
      "Returns an ordered remediation plan — fix the first item, then call again to confirm it is resolved. " +
      "Call this before publish_to_app_store with submit_for_review=true.",
    inputSchema: {
      app_id: z.string().describe("The App Store Connect app ID (from list_asc_apps)"),
      version: z.string().describe("App Store version string e.g. '1.2.3'"),
    },
  }, async ({ app_id, version }) => {
    const result = await validateAppSubmission(app_id, version);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  });

  server.registerTool("set_version_metadata", {
    description:
      "Update App Store version localization metadata — What's New text, description, keywords, and more. " +
      "What's New is required for every release before submitting for review. " +
      "Call once per locale — en-US is the required default; add other locales if the app supports them. " +
      "Use validate_app_submission afterward to confirm the update resolved the blocker.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
    inputSchema: {
      app_id: z.string().describe("The App Store Connect app ID (from list_asc_apps)"),
      version: z.string().describe("App Store version string e.g. '1.2.3'"),
      locale: z.string().default("en-US").describe("BCP-47 locale e.g. 'en-US', 'de-DE', 'zh-Hans' (default: en-US)"),
      whats_new: z.string().optional().describe("What's New in this version (required by Apple for every release)"),
      description: z.string().optional().describe("Full app description"),
      keywords: z.string().optional().describe("Comma-separated search keywords"),
      promotional_text: z.string().optional().describe("Promotional text shown above the description"),
      support_url: z.string().optional().describe("Support URL"),
      marketing_url: z.string().optional().describe("Marketing URL"),
    },
  }, async ({ app_id, version, locale, whats_new, description, keywords, promotional_text, support_url, marketing_url }) => {
    const result = await setVersionMetadata(app_id, version, locale, {
      whatsNew: whats_new,
      description,
      keywords,
      promotionalText: promotional_text,
      supportUrl: support_url,
      marketingUrl: marketing_url,
    });
    return {
      content: [{ type: "text", text: `Metadata updated for ${version} (${locale}).\n${JSON.stringify(result, null, 2)}` }],
    };
  });

  server.registerTool("set_export_compliance", {
    description:
      "Set the export compliance declaration for an iOS build. " +
      "Required before App Store submission and for TestFlight external distribution. " +
      "Most apps only use standard HTTPS/TLS — set uses_non_exempt_encryption to false. " +
      "Only set it to true if the app implements custom or proprietary encryption beyond standard protocols. " +
      "Defaults to the latest build for the app; pass build_id to target a specific build.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
    inputSchema: {
      app_id: z.string().describe("The App Store Connect app ID (from list_asc_apps)"),
      uses_non_exempt_encryption: z.boolean().describe("Set to false for apps that only use HTTPS/TLS (most apps). Set to true only for apps with custom proprietary encryption."),
      build_id: z.string().optional().describe("Specific build ID to update — defaults to the latest build"),
    },
  }, async ({ app_id, uses_non_exempt_encryption, build_id }) => {
    const result = await setExportCompliance(app_id, uses_non_exempt_encryption, build_id);
    return {
      content: [{
        type: "text",
        text: `Export compliance set: uses_non_exempt_encryption=${uses_non_exempt_encryption}.\n${JSON.stringify(result, null, 2)}`,
      }],
    };
  });

  server.registerTool("release_version", {
    description:
      "Release an App Store version that has been approved and is waiting in 'Pending Developer Release' state. " +
      "This immediately makes the update available to all users (or starts the phased rollout if one was configured). " +
      "Use set_phased_release with action=create before submission if you want a gradual rollout instead of an instant release.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
    },
    inputSchema: {
      app_id: z.string().describe("The App Store Connect app ID (from list_asc_apps)"),
      version: z.string().describe("App Store version string e.g. '1.2.3'"),
    },
  }, async ({ app_id, version }) => {
    const result = await releaseVersion(app_id, version);
    return {
      content: [{ type: "text", text: `Version ${version} released.\n${JSON.stringify(result, null, 2)}` }],
    };
  });
  
  server.registerTool("set_phased_release", {
    description:
      "Manage a phased rollout for an App Store version. " +
      "Phased rollout gradually releases the update over 7 days: 1% → 2% → 5% → 10% → 20% → 50% → 100%. " +
      "Actions: 'create' — configure phased rollout before submitting for review. " +
      "'pause' — pause an in-progress rollout (use if a critical bug is found after release). " +
      "'resume' — resume a paused rollout. " +
      "'complete' — immediately release to all remaining users.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
    inputSchema: {
      app_id: z.string().describe("The App Store Connect app ID (from list_asc_apps)"),
      version: z.string().describe("App Store version string e.g. '1.2.3'"),
      action: z.enum(["create", "pause", "resume", "complete"]).describe(
        "create: set up phased rollout before submission | pause: halt rollout | resume: continue after pause | complete: release to all users now"
      ),
    },
  }, async ({ app_id, version, action }) => {
    const result = await setPhasedRelease(app_id, version, action);
    const messages: Record<string, string> = {
      create: `Phased rollout configured for version ${version}. It will start automatically after the version is approved and released.`,
      pause: `Phased rollout paused for version ${version}.`,
      resume: `Phased rollout resumed for version ${version}.`,
      complete: `Phased rollout completed — version ${version} is now available to all users.`,
    };
    return {
      content: [{ type: "text", text: `${messages[action]}\n${JSON.stringify(result, null, 2)}` }],
    };
  });

  server.registerTool("submit_beta_review", {
    description:
      "Submit a build for TestFlight beta app review. " +
      "Required before external beta groups can install the build — Apple reviews it once, then all external groups can access it. " +
      "Internal groups (Apple employees / org members) do not require beta review. " +
      "Get the build ID from list_asc_builds.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
    inputSchema: {
      build_id: z.string().describe("The App Store Connect build ID (from list_asc_builds)"),
    },
  }, async ({ build_id }) => {
    const result = await submitBetaReview(build_id);
    return {
      content: [{ type: "text", text: `Build submitted for beta review.\n${JSON.stringify(result, null, 2)}` }],
    };
  });
  
  server.registerTool("add_testflight_tester", {
    description:
      "Add a tester to TestFlight by email address. " +
      "Optionally assign them to a specific beta group — use list_testflight_groups to get group names. " +
      "The tester receives an invitation email from Apple.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
    inputSchema: {
      app_id: z.string().describe("The App Store Connect app ID (from list_asc_apps)"),
      email: z.string().describe("Tester email address"),
      group: z.string().optional().describe("Beta group name or ID to add the tester to (from list_testflight_groups)"),
    },
  }, async ({ app_id, email, group }) => {
    const result = await addTestFlightTester(app_id, email, group);
    return {
      content: [{ type: "text", text: `Tester ${email} added.\n${JSON.stringify(result, null, 2)}` }],
    };
  });
  
  server.registerTool("create_testflight_group", {
    description:
      "Create a new TestFlight beta group for an app. " +
      "External groups require beta app review before testers can install builds. " +
      "Internal groups (Apple org members) do not require review — useful for fast internal QA.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
    inputSchema: {
      app_id: z.string().describe("The App Store Connect app ID (from list_asc_apps)"),
      name: z.string().describe("Display name for the group e.g. 'External Beta Testers'"),
      internal: z.boolean().optional().describe("Create an internal group (Apple org members only, no beta review required). Default: false (external group)."),
    },
  }, async ({ app_id, name, internal }) => {
    const result = await createTestFlightGroup(app_id, name, internal ?? false);
    return {
      content: [{ type: "text", text: `Group '${name}' created.\n${JSON.stringify(result, null, 2)}` }],
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

  server.registerTool("publish_to_app_store", {
    description:
      "Download an IPA artifact from Codemagic and publish it to the App Store. " +
      "Uploads the IPA, waits for Apple build processing (5–15 min), and attaches the build to the App Store version. " +
      "WARNING: this is a long-running operation — the full call can take 20–40 minutes. " +
      "Set submit_for_review to true to also submit for review in the same call — only do this when " +
      "version metadata (What's New text) and export compliance are already set. " +
      "After uploading without submitting, use get_asc_release_status to verify readiness.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
    inputSchema: {
      app_id: z.string().describe("The App Store Connect app ID (from list_asc_apps)"),
      ipa_url: z.string().describe("The IPA download URL from a Codemagic build artifact"),
      version: z.string().optional().describe("App Store version string e.g. '1.2.3' — defaults to the version embedded in the IPA"),
      submit_for_review: z.boolean().optional().describe("Submit for App Store review after attaching the build (default: false)"),
    },
  }, async ({ app_id, ipa_url, version, submit_for_review }) => {
    const result = await publishToAppStore(app_id, ipa_url, version, submit_for_review ?? false);
    const lines = [
      submit_for_review
        ? "IPA uploaded and submitted for App Store review."
        : "IPA uploaded and attached to App Store version.",
      result,
      "",
      submit_for_review
        ? "Track review progress with get_asc_review_status."
        : "Next: call get_asc_release_status to verify readiness, then call publish_to_app_store again with submit_for_review=true when ready.",
    ];
    return {
      content: [{ type: "text", text: lines.join("\n") }],
    };
  });

}