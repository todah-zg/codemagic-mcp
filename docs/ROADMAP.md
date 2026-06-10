# codemagic-mcp Roadmap

*Based on capability research across the App Store Connect API, the asc CLI, the
Google Play Developer API, codemagic-cli-tools, and the third-party testing
ecosystem (June 2026).*

The product thesis stays fixed: **Codemagic builds and signs; the agent handles the
reactive store lifecycle.** Every phase below deepens one side of that seam without
crossing it.

---

## Where we are (Phase 1 — complete)

27 tools across four domains (Codemagic, ASC, Google Play, YAML), 15 yaml
templates, project-type detection, three workflow prompts, webhook management,
27 passing tests. Full loop proven: onboard repo → debug build → release build →
TestFlight / Google Play.

What we can NOT do today: ship to the **App Store** (TestFlight is our iOS
terminus), manage store listings, promote/stage releases, generate store assets,
or guide a first-time publisher through the parts that genuinely require a human.

---

## Phase 2 — Complete the publishing loop

*The biggest gap: an agent can deliver a build to TestFlight but cannot release
anything to either store. This phase closes the loop end-to-end.*

### iOS (wrapping more of the asc CLI we already require) (complete)

The asc CLI turns out to cover nearly the entire ASC API surface (verified
locally via `asc capabilities`). New tools, in priority order:

| Tool | Wraps | Why |
|---|---|---|
| `publish_to_app_store` | `asc publish appstore --ipa … --version … --submit` | The canonical upload + submit flow in one command — the single most important missing capability |
| `validate_app_submission` | `asc validate` | Preflight readiness report; catches missing metadata/compliance before a doomed submission |
| `set_version_metadata` | `asc apps info edit` / `asc localizations` | "What's New" is mandatory every release; submission is unusable without it |
| `set_export_compliance` | `asc encryption` | A missing declaration silently blocks TestFlight distribution |
| `release_version` / `set_phased_release` | `asc release` / phased-release controls | Start/pause/resume a rollout — exactly the reactive lifecycle agents are good at |
| `add_testflight_tester` / `create_testflight_group` | `asc testflight testers/groups` | Real gap: cli-tools has no tester-by-email management |
| `submit_beta_review` | `asc review submit` (beta) | Required before any external TestFlight distribution |

### Android (google-play CLI + direct androidpublisher calls)

| Tool | Wraps | Why |
|---|---|---|
| `promote_google_play_release` | `google-play tracks promote-release` | internal → alpha → beta → production without re-uploading; supports staged rollout fraction |
| `set_rollout_fraction` / `halt_rollout` | `google-play tracks set-release` | Expand, pause, or halt a staged rollout — the "something is wrong, stop the release" button |
| `share_app_internally` | `google-play internal-app-sharing upload` | Instant shareable QA link, no track/review ceremony, same credentials we already hold — cheapest high-value add |
| `get_latest_build_number` | `google-play get-latest-build-number` | Replaces the "scan all tracks and find the max" dance in our prompts |

### Cross-store

| Tool | Notes |
|---|---|
| `prepare_release_notes` | Read-only: takes a git commit range (or infers it from the last store release), drafts localized release notes. Validates the 500-char Google Play limit and BCP-47 codes. The LLM writes; the tool fetches inputs and validates output. |

### Diagnostic tools

| Tool | Notes |
|---|---|
| `get_build_logs` | Fetch logs for a build — enables the agent to diagnose failures (missing dependency, signing error, bad YAML) and propose a fix without human intervention. API endpoint TBD; log output may need truncation or step-level filtering for large builds. |

**Build page URL:** `trigger_build` should also return the direct Codemagic build URL (`https://codemagic.io/app/{appId}/build/{buildId}`), constructable from data already in hand — no extra API call. The user can open it immediately to watch the build in real time.

**Deliverable:** prompts updated so `/ios_release` ends at the App Store (not
TestFlight) and `/android_release` includes promote + staged rollout guidance.

### Codemagic API completeness

Gaps identified via competitive analysis (June 2026):

| Tool | Priority | Notes |
|---|---|---|
| `cancel_build` | High — in this release | If an agent triggers the wrong build, it has no way to stop it. One POST call. |
| `get_user` / `list_teams` | High | The agent can't discover which teams the token belongs to — `list_builds` requires a `team_id` that must be known in advance. `list_teams` solves the discovery problem. |
| Instance type on `trigger_build` | Medium | Templates hardcode the machine type; the agent can't override it without editing the full YAML. An `instance_type` parameter would allow a one-line override at trigger time. |
| `update_variable` / `delete_variable` | Low | CRUD completeness for variable management |
| `list_caches` / `delete_caches` | Low | Useful when debugging slow builds or storage exhaustion |
| `create_public_artifact_url` | Low | Share IPA/AAB links externally without requiring Codemagic auth |

### Rethinking build status polling

The current `wait_for_build` design has a fundamental impedance mismatch: MCP clients timeout in ~60 seconds, but a Codemagic build machine takes 45–60 seconds just to spin up. With a 30-second polling interval, the tool gets at most one status check before hitting the timeout — and that check almost always returns "still building" because the machine hasn't even started executing yet.

The re-entrant "call again" pattern we shipped is correct in structure. But several things need adjustment:

- The default `max_wait_seconds` should drop from 55 to ~30 — one check with headroom, not two
- The default `interval_seconds` should drop to 10–15s so the check actually happens before timeout
- Tool descriptions and prompt playbooks should explicitly tell agents that calling `get_build` or `wait_for_build` 10–20 times across a 10–40 minute build is normal — the "still building" response is a success, not an error
- Consider whether `wait_for_build` should be simplified to a single-check tool (check once, return status immediately or after one short sleep) and let the agent handle retry cadence — that is the more correct MCP architecture

**Medium term:** MCP streaming responses let a single tool call emit status updates over time — no repeated calls, no client-side timeout. Worth tracking the MCP spec here.

**Phase 5 (hosted) fully solves this:** the hosted server can maintain server-side build-monitoring jobs. `trigger_build` registers a job; `wait_for_build` polls the job's resolved state server-side. The agent gets build completion without holding a connection open for 40 minutes. Codemagic already has this infrastructure.

### Long-running App Store operations

`publish_to_app_store` has the same impedance mismatch. The current implementation uses `asc publish appstore --wait`, which blocks for the full upload + Apple build processing + version attachment — up to 40 minutes in one tool call. This works with Claude Desktop today (no hard timeout), but is fragile for any client that enforces a timeout.

The correct fix is to split into two steps:
1. **Upload only** — `asc builds upload --app … --ipa …` (no `--wait`), returns in ~2 minutes with the build in processing state. A `build_number` or build ID is returned for polling.
2. **Attach + submit** — a separate call once the agent observes `processingState: VALID` via `list_asc_builds` or `get_asc_release_status`. Then attaches the build to the App Store version and optionally submits.

This mirrors the `wait_for_build` re-entrant pattern: fast initial action, agent polls for completion, then acts on the result.

---

## Phase 3 — Store presence (listings & assets)

*After the loop works, make the store listing itself agent-manageable.*

- **Store listing text** — iOS via `asc metadata pull/validate/apply` (it even has
  a deterministic sync workflow and fastlane migration); Android via
  `edits.listings` (direct API — the google-play CLI does not cover listings).
- **Screenshot upload** — iOS via `asc screenshots upload/plan/apply` (handles the
  chunked upload protocol for us); Android via `edits.images` per locale + type.
- **Screenshot capture templates** — new yaml templates that produce screenshots
  as build artifacts:
  - Flutter golden tests at store resolutions (Codemagic's own documented
    approach; no emulator/simulator needed — works on any instance type)
  - fastlane snapshot for native iOS (simulators work on the M-series Macs)
  - Constraint to encode in templates: **Codemagic Apple-silicon Macs cannot run
    Android emulators** — Android capture goes on Linux instances or via golden
    tests
- **Caption/frame pipeline** — agent reviews captured screenshots, writes
  localized captions; `asc screenshots frame` (experimental) or frameit for
  device frames. Store policy note: screenshots must reflect the real app — AI
  frames and captions real captures, never fabricates screens.
- **Data safety form (Android)** — `applications.dataSafety` accepts the CSV
  declaration via API; one of the few compliance forms that IS automatable.

---

## Phase 4 — The guidance layer (first-publish reality)

*Research verdict: neither store allows creating the app record via public API.
The first publish cannot be 100% agent-driven — so we make the human part as
small and as guided as possible.*

**The hard, human-only steps:**

| | iOS | Android |
|---|---|---|
| Account setup | Apple Developer Program enrollment, agreements/tax/banking | Play developer account ($25), identity verification |
| App record creation | Web UI only (no `POST /v1/apps`) | Web UI only (no create in androidpublisher v3) |
| Compliance forms | Privacy "nutrition labels" (UI only) | IARC content rating, app-content declarations (UI only) |
| Review friction | Resolution Center replies are UI-only | New personal accounts: mandatory closed-testing period with minimum testers before production access |

**What we build:**

- `first_publish_checklist` prompt (per platform) — walks the human through the
  one-time ~10-minute UI session with exact navigation steps, then the agent
  takes over everything else, forever.
- `check_publish_readiness` tool — aggregates `asc validate` (iOS) and edit
  validation (Android) into a single "can we ship today, and if not, what is
  missing and who fixes it (agent vs human)" report. This is the feature for the
  audience that "might not know what is needed in the first place."
- Rejection handling: agent detects rejection via `get_asc_review_status`,
  explains the cited guideline, prepares the fixed resubmission; human replies
  in Resolution Center if a message is required. (asc has experimental
  `web review` for rejection detail — watch, don't depend.)

---

## Phase 5 — Hosted by Codemagic

Covered in detail in [HOSTING.md](./HOSTING.md): streamable HTTP transport,
stateless token-per-request, CLI→REST migration, credential references into the
Codemagic secret store (the moat), rollout plan. Decision pending.

### RBAC integration

Codemagic is actively developing Role Based Access Control for teams — defining what each user or token can do (trigger builds, manage variables, delete apps, etc.). The hosted MCP server should integrate with this natively:

- Tools that the token's role prohibits are hidden from the agent's tool list or return a clear authorization error before any action is taken
- `list_applications` and `list_builds` scope their results to what the token can access
- Destructive tools (`delete_webhook`, `trigger_build`) can respect approval gates if RBAC defines them

This turns Codemagic's RBAC into an **agent containment layer** — the organization decides what agents are allowed to do, not the individual developer. Critical for enterprise adoption.

The local (stdio) version benefits too: a read-only token naturally produces a server where write operations fail at the API level. RBAC makes that guarantee explicit and configurable without touching the MCP server itself.

---

## Explicitly deferred (and why)

| Capability | Verdict | Reason |
|---|---|---|
| Firebase App Distribution upload | Defer to yaml | `publishing.firebase:` in codemagic.yaml is the deterministic path; we add a template. An official Firebase MCP server exists for the rest. |
| Slack / email / Telegram notifications | Defer to yaml | First-class in codemagic.yaml publishing; our templates cover it for free. |
| BrowserStack device testing | Defer | Official, actively maintained BrowserStack MCP server exists; users compose it alongside ours. |
| Maestro / E2E in cloud | Defer to yaml | Runs as script steps on Codemagic VMs already. |
| In-app purchases / subscriptions | Later | Full API + asc CLI support exists, but it is a deep domain; revisit on demand. |
| Analytics / sales / finance reports | Later | `asc analytics/finance` covers it; agent-shaped but not publishing-critical. |
| Customer review replies | Later (cheap) | Both stores have APIs (≤350 chars on Play); nice agent win when Phase 2/3 settle. |
| Diawi, Appetize.io | Skip / park | Superseded by TestFlight + internal app sharing; Appetize's browser-preview is interesting for demos but unverified. |

---

## Sequencing rationale

Phase 2 before Phase 3 because an agent that can *ship* but not *decorate* is
useful; the reverse is not. Phase 4 is interleaved-able — the checklist prompt
costs little and serves the exact audience we target. Phase 5 is a business
decision, not an engineering sequence point; nothing in Phases 2–4 blocks on it,
and everything in them increases its value.
