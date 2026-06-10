# codemagic-mcp

An MCP (Model Context Protocol) server that gives AI agents a unified surface over **Codemagic CI/CD** and **App Store Connect / Google Play**, enabling a complete mobile app delivery pipeline — from onboarding a repository through building, signing, and publishing — driven by conversation.

## What it does

The server exposes tools across three domains:

- **Codemagic** — list apps, trigger builds, wait for results, retrieve artifacts, manage variable groups
- **App Store Connect** — list builds, manage TestFlight groups, check review/release status, upload IPAs
- **Google Play** — list tracks, list bundles, publish AABs to any track

The intended end-to-end flows are:

**iOS:** `list_asc_builds` (get next build number) → `get_yaml_template` → `trigger_build` → `wait_for_build` → `upload_to_testflight`

**Android:** `list_google_play_tracks` (get next build number) → `get_yaml_template` → `trigger_build` → `wait_for_build` → `upload_to_google_play`

## Prerequisites

- **Node.js** 20 or 22 (LTS)
- **asc CLI** — [asccli.sh](https://asccli.sh) — required for App Store Connect tools
- **google-play CLI** — part of [codemagic-cli-tools](https://github.com/codemagic-ci-cd/cli-tools) — required for Google Play tools
  ```
  pip install codemagic-cli-tools
  ```

## Environment variables

### Required

| Variable | Description |
|----------|-------------|
| `CODEMAGIC_API_TOKEN` | Your Codemagic API token. Found in Codemagic → User settings → Integrations. |

### App Store Connect tools (iOS)

| Variable | Description |
|----------|-------------|
| `ASC_KEY_ID` | App Store Connect API key ID |
| `ASC_ISSUER_ID` | App Store Connect issuer ID |
| `ASC_PRIVATE_KEY_B64` | Base64-encoded `.p8` private key (`base64 -i AuthKey_XXXX.p8`) |
| `ASC_BYPASS_KEYCHAIN` | Set to `1` to force env var auth instead of the macOS keychain |

### Google Play tools (Android)

| Variable | Description |
|----------|-------------|
| `GOOGLE_PLAY_SERVICE_ACCOUNT_CREDENTIALS` | Raw JSON content of your Google Play service account key file |

For the Google Play credentials you can use the `@file:` prefix to avoid pasting JSON inline:
```
GOOGLE_PLAY_SERVICE_ACCOUNT_CREDENTIALS=@file:/path/to/service-account.json
```

## Installation

```
npm install
npm run build
```

## Running

### MCP Inspector (development / testing)

Set the required environment variables in your shell, then:

```
npx @modelcontextprotocol/inspector node dist/index.js
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

**If installed from npm**

```json
{
  "mcpServers": {
    "codemagic": {
      "command": "npx",
      "args": ["-y", "codemagic-mcp"],
      "env": {
        "CODEMAGIC_API_TOKEN": "your-token",
        "ASC_KEY_ID": "your-key-id",
        "ASC_ISSUER_ID": "your-issuer-id",
        "ASC_PRIVATE_KEY_B64": "base64-encoded-p8-key",
        "ASC_BYPASS_KEYCHAIN": "1",
        "GOOGLE_PLAY_SERVICE_ACCOUNT_CREDENTIALS": "@file:/path/to/service-account.json"
      }
    }
  }
}
```

**If running from a local clone (development):**

```json
{
  "mcpServers": {
    "codemagic": {
      "command": "node",
      "args": ["/absolute/path/to/codemagic-mcp/dist/index.js"],
      "env": {
        "CODEMAGIC_API_TOKEN": "your-token",
        "ASC_KEY_ID": "your-key-id",
        "ASC_ISSUER_ID": "your-issuer-id",
        "ASC_PRIVATE_KEY_B64": "base64-encoded-p8-key",
        "ASC_BYPASS_KEYCHAIN": "1",
        "GOOGLE_PLAY_SERVICE_ACCOUNT_CREDENTIALS": "@file:/path/to/service-account.json"
      }
    }
  }
}
```

The config file is at:
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

## Using with Claude Desktop

### Connecting the server

To verify the server is connected, open a new conversation and ask: *"ping the codemagic mcp server"*. If connected, Claude will call the `ping` tool and respond with "Codemagic MCP server is running." If not connected, check that the path in `args` is correct and that all required environment variables are set, then restart Claude Desktop with Cmd+Q (not just closing the window).

If the server does not appear, check that the `CODEMAGIC_API_TOKEN` environment variable is set correctly in the config and that the path to `dist/index.js` is absolute and correct.

### Workflow prompts

Once connected, type `/` in the Claude Desktop input field to open the command picker. You will see three workflow prompts from this server:

| Prompt | When to use |
|--------|-------------|
| `/onboarding` | Starting from scratch — connect a repo, get a first build passing |
| `/android_release` | Build a signed AAB and publish it to Google Play |
| `/ios_release` | Build a signed IPA and upload it to TestFlight |

Select a prompt and Claude will receive a step-by-step playbook and begin executing the workflow using the available tools.

### Example conversations

You can also describe what you want in plain language — Claude will select the right tools automatically:

> "I have a Flutter app at github.com/example/myapp. Set it up on Codemagic and get a first build running."

> "Trigger a release build for my Android app, version 2.1.0. The last build number on Google Play was 41."

> "What is the current App Store review status for my iOS app?"

### Config file location

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

## Tools

### Codemagic

| Tool | Description |
|------|-------------|
| `ping` | Check that the server is running |
| `list_applications` | List apps in your Codemagic account or team |
| `list_workflows` | List workflows for an app |
| `list_builds` | List builds with optional filters (app, status, branch, workflow) |
| `get_build` | Get full details for a single build including artifacts |
| `trigger_build` | Trigger a build; optionally supply an inline `codemagic.yaml` |
| `wait_for_build` | Poll until a build reaches a terminal state; returns artifacts |
| `add_application` | Connect a Git repository to Codemagic |
| `get_webhook_url` | Get the incoming webhook URL to paste into your Git provider settings |
| `list_webhooks` | List webhook subscriptions configured for an app |
| `delete_webhook` | Delete a webhook subscription from an app |

### App Store Connect (iOS)

| Tool | Description |
|------|-------------|
| `list_asc_apps` | List apps in App Store Connect |
| `list_asc_builds` | List TestFlight builds for an app |
| `list_testflight_groups` | List TestFlight beta groups |
| `get_asc_review_status` | Get the App Store review state for an app |
| `get_asc_release_status` | Full release pipeline dashboard (builds, TestFlight, App Store) |
| `upload_to_testflight` | Download an IPA from Codemagic and upload to TestFlight |

### Google Play (Android)

| Tool | Description |
|------|-------------|
| `list_google_play_tracks` | List tracks (internal, alpha, beta, production) with release info |
| `list_google_play_bundles` | List uploaded AABs by version code |
| `upload_to_google_play` | Download an AAB from Codemagic and publish to a Google Play track |

### Variable Groups

| Tool | Description |
|------|-------------|
| `list_variable_groups` | List variable groups for a team or app — use group names to reference them in builds |
| `create_variable_group` | Create a new variable group (team or app scoped) |
| `add_variable` | Add a non-secret variable to a group |

### YAML

| Tool | Description |
|------|-------------|
| `validate_codemagic_yaml` | Validate a `codemagic.yaml` against the official Codemagic JSON schema |
| `get_yaml_template` | Get a starter `codemagic.yaml` for android, ios, flutter, flutter-native, react-native, ionic-capacitor, ionic-cordova, kmm, snap, unity, unity-oculus, dotnet-maui — plus android-debug, flutter-android-debug, react-native-android-debug for initial onboarding |
| `list_yaml_template_types` | List all supported project types for `get_yaml_template` |
| `detect_project_type` | Detect the project type from a repository file listing — returns the recommended template and debug template to start with |

### Prompts

| Prompt | Description |
|--------|-------------|
| `onboarding` | Zero to first debug build — add repo, get template, trigger build, configure webhook |
| `android_release` | Signed AAB from build to Google Play — build number, template, trigger, publish |
| `ios_release` | Signed IPA from build to TestFlight — build number, template, trigger, upload |

Prompts are reusable workflow playbooks. In Claude Desktop they appear as slash commands. An agent can also invoke them by name to get step-by-step instructions for a complete workflow.

## Project structure

```
src/
  index.ts              — Server setup, env validation, transport
  codemagic.ts          — Codemagic API functions
  asc.ts                — App Store Connect CLI wrapper
  googleplay.ts         — Google Play CLI wrapper
  yaml.ts               — YAML validation logic
  templates.ts          — Static codemagic.yaml templates
  detection.ts          — Project type detection from repository file listings
  prompts.ts            — MCP prompt resources (workflow playbooks)
  tools/
    codemagic.ts        — Codemagic MCP tool registrations
    asc.ts              — App Store Connect MCP tool registrations
    googleplay.ts       — Google Play MCP tool registrations
    yaml.ts             — YAML MCP tool registrations
```

The `src/` modules contain pure functions (API calls, CLI wrappers) with no MCP dependency.
The `src/tools/` modules wire those functions up as MCP tools — input schemas, formatting, error responses.

## Notes

- **Inline YAML:** `trigger_build` accepts an optional `yaml_content` parameter. When provided, the YAML is uploaded alongside the build request and does not need to exist in the repository. Useful for agent-generated configurations.
- **Build numbers:** Templates use `$BUILD_NUMBER` and `$VERSION_NAME` as plain variables — no store lookups happen inside the YAML. The agent determines the correct values via `list_asc_builds` or `list_google_play_tracks` before triggering, then passes them through the `variables` parameter of `trigger_build`.
- **Signing:** iOS signing happens on the Codemagic build machine (macOS + keychain). The MCP server never handles signing identities directly.
- **Team vs. personal account:** `list_applications` and `list_builds` accept an optional `team_id`. Without it, they operate on the authenticated user's personal account.
- **Variable groups and secrets:** `add_variable` only creates non-secret variables. Secret values (API keys, certificates, tokens) should be added directly in the Codemagic UI — secrets should never pass through the agent. Once set up, reference groups by name in `trigger_build` via the `groups` parameter.
