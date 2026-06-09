# codemagic-mcp

An MCP (Model Context Protocol) server that gives AI agents a unified surface over **Codemagic CI/CD** and **App Store Connect / Google Play**, enabling a complete mobile app delivery pipeline — from onboarding a repository through building, signing, and publishing — driven by conversation.

## What it does

The server exposes tools across three domains:

- **Codemagic** — list apps, trigger builds, wait for results, retrieve artifacts, manage variable groups
- **App Store Connect** — list builds, manage TestFlight groups, check review/release status, upload IPAs
- **Google Play** — list tracks, list bundles, publish AABs to any track

The intended end-to-end flows are:

**iOS:** `get_yaml_template` → `trigger_build` → `wait_for_build` → `upload_to_testflight`

**Android:** `get_yaml_template` → `trigger_build` → `wait_for_build` → `upload_to_google_play`

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
| `get_yaml_template` | Get a starter `codemagic.yaml` for flutter, react-native, ios, android, unity, ionic-capacitor, or ionic-cordova |

## Notes

- **Inline YAML:** `trigger_build` accepts an optional `yaml_content` parameter. When provided, the YAML is uploaded alongside the build request and does not need to exist in the repository. Useful for agent-generated configurations.
- **Signing:** iOS signing happens on the Codemagic build machine (macOS + keychain). The MCP server never handles signing identities directly.
- **Team vs. personal account:** `list_applications` and `list_builds` accept an optional `team_id`. Without it, they operate on the authenticated user's personal account.
- **Variable groups and secrets:** `add_variable` only creates non-secret variables. Secret values (API keys, certificates, tokens) should be added directly in the Codemagic UI — secrets should never pass through the agent. Once set up, reference groups by name in `trigger_build` via the `groups` parameter.
