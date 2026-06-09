import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const ONBOARDING_GUIDE = `
# Codemagic Onboarding — Zero to First Build

Goal: get an Android debug build passing to prove the project compiles on Codemagic.
Signing, release builds, and store publishing come after this succeeds.

1. ADD THE APPLICATION
   Call add_application with the repository URL.
   Note the app_id returned.

2. GET A DEBUG TEMPLATE
   Call get_yaml_template with the matching debug project type:
     android-debug, flutter-android-debug, or react-native-android-debug.
   Replace PACKAGE_NAME with the actual application ID.

3. VALIDATE THE YAML
   Call validate_codemagic_yaml with the edited yaml.
   Fix any errors before proceeding.

4. TRIGGER THE FIRST BUILD
   Call trigger_build with:
     app_id    — from step 1
     workflow_id — the workflow name inside the yaml (e.g. "android-debug")
     branch    — the default branch (main or master)
     yaml_content — the validated yaml from step 2

5. WAIT FOR THE RESULT
   Call wait_for_build with the build ID.
   A green build means the project compiles on Codemagic.

6. CONFIGURE WEBHOOKS (optional)
   Call get_webhook_url with the app ID.
   Add the returned URL to the repository webhook settings in GitHub/GitLab/Bitbucket
   to enable automatic builds on push.

Next steps: once the debug build passes, use the android_release or ios_release prompt.
`.trim();

const ANDROID_RELEASE_GUIDE = `
# Android Release — Signed AAB to Google Play

Prerequisites:
  - Android keystore uploaded in Codemagic → Code signing → Android keystores
    (the reference name in the template is "keystore_reference")
  - GOOGLE_PLAY_SERVICE_ACCOUNT_CREDENTIALS set in the environment

1. DETERMINE THE NEXT BUILD NUMBER
   Call list_google_play_tracks with the package name.
   Find the highest versionCode across all tracks.
   Increment by 1 — this is BUILD_NUMBER.
   Decide VERSION_NAME (e.g. "1.2.0").

2. GET THE RELEASE TEMPLATE
   Call get_yaml_template with the matching project type:
     android, flutter, react-native, ionic-capacitor, ionic-cordova, kmm, etc.
   Replace PACKAGE_NAME with the actual application ID.

3. VALIDATE THE YAML
   Call validate_codemagic_yaml with the edited yaml.

4. TRIGGER THE BUILD
   Call trigger_build with:
     app_id, workflow_id, branch
     yaml_content — the validated yaml
     variables    — { "BUILD_NUMBER": "42", "VERSION_NAME": "1.2.0" }

5. WAIT FOR THE BUILD
   Call wait_for_build. Note the AAB artifact URL on success.

6. PUBLISH TO GOOGLE PLAY
   Call upload_to_google_play with:
     aab_url — the AAB artifact URL from step 5
     track   — "internal" (safest; promote manually in Play Console afterward)
     release_notes (optional)
`.trim();

const IOS_RELEASE_GUIDE = `
# iOS Release — Signed IPA to TestFlight

Prerequisites:
  - Distribution certificate and provisioning profile in Codemagic → Code signing → iOS certificates
  - ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY_B64 set in the environment

1. GET THE ASC APP ID
   Call list_asc_apps.
   Note the ASC app ID for your app — it is different from the Codemagic app ID.

2. DETERMINE THE NEXT BUILD NUMBER
   Call list_asc_builds with the ASC app ID.
   Find the highest version number. Increment by 1 — this is BUILD_NUMBER.
   Decide VERSION_NAME (e.g. "1.2.0").

3. CHECK RELEASE PIPELINE STATUS (optional but useful)
   Call get_asc_release_status to see the current state before starting.

4. GET THE RELEASE TEMPLATE
   Call get_yaml_template with the matching project type:
     ios, flutter, react-native, ionic-capacitor, ionic-cordova, kmm, dotnet-maui, etc.
   Replace bundle_identifier, XCODE_WORKSPACE, and XCODE_SCHEME with your app's values.

5. VALIDATE THE YAML
   Call validate_codemagic_yaml with the edited yaml.

6. TRIGGER THE BUILD
   Call trigger_build with:
     app_id (Codemagic app ID), workflow_id, branch
     yaml_content — the validated yaml
     variables    — { "BUILD_NUMBER": "42", "VERSION_NAME": "1.2.0" }

7. WAIT FOR THE BUILD
   Call wait_for_build. Note the IPA artifact URL on success.

8. UPLOAD TO TESTFLIGHT
   Call upload_to_testflight with:
     app_id    — the ASC app ID from step 1
     ipa_url   — the IPA artifact URL from step 7
     beta_group (optional) — call list_testflight_groups to find available group names
`.trim();

/**
 * Register MCP prompt resources — named, reusable workflow playbooks.
 * Agents can invoke these by name to get step-by-step instructions for
 * common Codemagic operations. Claude Desktop surfaces them as slash commands.
 * @param server - The MCP server instance.
 */
export function registerPrompts(server: McpServer): void {

  server.registerPrompt(
    "onboarding",
    { description: "Step-by-step guide to connect a repository to Codemagic and trigger a first debug build" },
    () => ({
      messages: [{ role: "user", content: { type: "text", text: ONBOARDING_GUIDE } }],
    })
  );

  server.registerPrompt(
    "android_release",
    { description: "Step-by-step guide to build a signed Android AAB on Codemagic and publish it to Google Play" },
    () => ({
      messages: [{ role: "user", content: { type: "text", text: ANDROID_RELEASE_GUIDE } }],
    })
  );

  server.registerPrompt(
    "ios_release",
    { description: "Step-by-step guide to build a signed iOS IPA on Codemagic and upload it to TestFlight" },
    () => ({
      messages: [{ role: "user", content: { type: "text", text: IOS_RELEASE_GUIDE } }],
    })
  );

}