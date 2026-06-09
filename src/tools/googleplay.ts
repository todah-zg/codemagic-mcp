import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listTracks, listBundles, uploadToGooglePlay } from "../googleplay.js";

export function registerGooglePlayTools(server: McpServer): void {

  server.registerTool("list_google_play_tracks", {
    description: "List available Google Play tracks for an app (internal, alpha, beta, production)",
    inputSchema: {
      package_name: z.string().describe("The Android package name, e.g. com.example.myapp"),
    },
  }, async ({ package_name }) => {
    const tracks = await listTracks(package_name);
    const lines = tracks.map(t => {
      if (!t.releases || t.releases.length === 0) return `${t.track}: no releases`;
      const releases = t.releases.map(r =>
        `  - ${r.name} (${r.status}) — versions: ${r.versionCodes.join(", ")}`
      ).join("\n");
      return `${t.track}:\n${releases}`;
    });
    return {
      content: [{ type: "text", text: lines.join("\n") }],
    };
  });

  server.registerTool("list_google_play_bundles", {
    description: "List uploaded App Bundles (AAB) for an app on Google Play",
    inputSchema: {
      package_name: z.string().describe("The Android package name, e.g. com.example.myapp"),
    },
  }, async ({ package_name }) => {
    const bundles = await listBundles(package_name);
    const text = bundles.map(b => `Version code ${b.versionCode}`).join("\n");
    return {
      content: [{ type: "text", text: text || "No bundles found." }],
    };
  });

  server.registerTool("upload_to_google_play", {
    description: "Download an AAB artifact from Codemagic and publish it to Google Play. The package name is extracted from the AAB automatically.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
    inputSchema: {
      aab_url: z.string().describe("The AAB download URL from a Codemagic build artifact"),
      track: z.enum(["internal", "alpha", "beta", "production"]).describe("The Google Play track to publish to"),
      release_name: z.string().optional().describe("Name of the release. If omitted, generated from the AAB version name."),
      release_notes: z.string().optional().describe("What's new in this release, as plain text"),
      release_notes_language: z.string().optional().describe("BCP-47 language tag for the release notes (default: en-US)"),
      draft: z.boolean().optional().describe("Upload as a draft release instead of publishing immediately"),
    },
  }, async ({ aab_url, track, release_name, release_notes, release_notes_language, draft }) => {
    const result = await uploadToGooglePlay(aab_url, track, release_name, release_notes, release_notes_language, draft);
    return {
      content: [{ type: "text", text: `Published to Google Play (${track} track).\n${result}` }],
    };
  });

}