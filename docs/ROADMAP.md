# codemagic-mcp Roadmap

*Based on capability research across the App Store Connect API, the asc CLI, the
Google Play Developer API, codemagic-cli-tools, and the third-party testing
ecosystem (June 2026).*

The product thesis stays fixed: **Codemagic builds and signs; the agent handles the
reactive store lifecycle.** Every phase below deepens one side of that seam without
crossing it.

---

## Where we are (Phase 3 — in progress)

**Phase 1:** 27 tools across four domains (Codemagic, ASC, Google Play, YAML), 15 yaml
templates, project-type detection, three workflow prompts, webhook management,
29 passing tests. Full loop proven: onboard repo → debug build → release build →
TestFlight / Google Play.

**Phase 2:** Complete publishing loop on both platforms, plus build diagnostics,
release note validation, and full Codemagic API coverage. iOS adds: `upload_build_to_asc`,
`submit_for_app_store_review`, `validate_app_submission`, `set_version_metadata`,
`set_export_compliance`, `release_version`, `set_phased_release`, `submit_beta_review`,
`add_testflight_tester`, `create_testflight_group`. Android adds:
`promote_google_play_release`, `set_rollout_fraction`, `share_app_internally`,
`get_latest_build_number`. Codemagic adds: `list_teams`, `get_build_logs`,
`list_variables`, `update_variable`, `delete_variable`, `list_caches`, `delete_cache`,
`create_public_artifact_url`, `instance_type` on `trigger_build`, `wait_for_build`
redesigned as single-check. Cross-store adds: `prepare_release_notes`. Both
`/ios_release` and `/android_release` prompts updated end-to-end.

**Phase 3 (partial):** Store listings and screenshots. iOS adds: `get_ios_store_listing`,
`set_ios_store_listing`, `list_ios_screenshot_types`, `upload_ios_screenshots`. Android
adds: `get_android_store_listing`, `set_android_store_listing`, `upload_android_screenshots`
via a new `androidpublisher.ts` direct API client (google-play CLI has no listing or image
support). New `codemagic.yaml` templates: `ios-screenshots` (Maestro + iOS simulator),
`android-screenshots` (Maestro + Android emulator on Linux), `flutter-screenshots`
(Flutter golden tests, no emulator). Total: 64 tools, 18 templates.

What we can NOT do today: Android data safety form, first-publish guidance (app record
creation, privacy labels, compliance forms are UI-only on both stores).

---

## Phase 2 — Complete the publishing loop

*The biggest gap: an agent can deliver a build to TestFlight but cannot release
anything to either store. This phase closes the loop end-to-end.*

### iOS (wrapping more of the asc CLI we already require)

The asc CLI turns out to cover nearly the entire ASC API surface (verified
locally via `asc capabilities`). New tools, in priority order:

| Tool | Wraps | Why |
|---|---|---|
| `upload_build_to_asc` + `submit_for_app_store_review` | `asc builds upload` (fast, no wait) + `asc review submit` | Replaces the original `publish_to_app_store` blocking call. Upload returns in 2-5 min; agent polls `list_asc_builds` until VALID; submit is near-instant. |
| `validate_app_submission` | `asc validate` | Preflight readiness report; catches missing metadata/compliance before a doomed submission |
| `set_version_metadata` | `asc apps info edit` / `asc localizations` | "What's New" is mandatory every release; submission is unusable without it |
| `set_export_compliance` | `asc encryption` | A missing declaration silently blocks TestFlight distribution |
| `release_version` / `set_phased_release` | `asc release` / phased-release controls | Start/pause/resume a rollout — exactly the reactive lifecycle agents are good at |
| `add_testflight_tester` / `create_testflight_group` | `asc testflight testers/groups` | Real gap: cli-tools has no tester-by-email management |
| `submit_beta_review` | `asc review submit` (beta) | Required before any external TestFlight distribution |

### Android (google-play CLI + direct androidpublisher calls) (complete)

| Tool | Wraps | Why |
|---|---|---|
| `promote_google_play_release` | `google-play tracks promote-release` | internal → alpha → beta → production without re-uploading; supports staged rollout fraction |
| `set_rollout_fraction` / `halt_rollout` | `google-play tracks set-release` | Expand, pause, or halt a staged rollout — the "something is wrong, stop the release" button |
| `share_app_internally` | `google-play internal-app-sharing upload` | Instant shareable QA link, no track/review ceremony, same credentials we already hold — cheapest high-value add |
| `get_latest_build_number` | `google-play get-latest-build-number` | Replaces the "scan all tracks and find the max" dance in our prompts |

### Cross-store

| Tool | Notes |
|---|---|
| `prepare_release_notes` | ✓ complete — validates BCP-47 locale codes and char limits (Android: 500, iOS: 4000). The LLM writes the notes; the tool validates them before submission. Git commit fetching deferred (requires per-provider auth complexity not worth the trade-off). |

### Diagnostic tools

| Tool | Notes |
|---|---|
| `get_build_logs` | ✓ complete — fetches per-step log text via the v1 API. Returns failed steps by default; optional `step_name` filter for specific steps. Logs truncated at 20k chars (tail). |

**Build page URL:** `trigger_build` should also return the direct Codemagic build URL (`https://codemagic.io/app/{appId}/build/{buildId}`), constructable from data already in hand — no extra API call. The user can open it immediately to watch the build in real time.

**Deliverable:** prompts updated so `/ios_release` ends at the App Store (not
TestFlight) and `/android_release` includes promote + staged rollout guidance.

### Codemagic API completeness

Gaps identified via competitive analysis (June 2026):

| Tool | Priority | Notes |
|---|---|---|
| `cancel_build` | ✓ complete | If an agent triggers the wrong build, it has no way to stop it. One POST call. |
| `get_user` / `list_teams` | ✓ complete | The agent can't discover which teams the token belongs to — `list_builds` requires a `team_id` that must be known in advance. `list_teams` solves the discovery problem. |
| `get_build_logs` | ✓ complete | Fetch per-step log text via v1 API (`api.codemagic.io/builds/{id}/step/{step_id}`). |
| Instance type on `trigger_build` | ✓ complete | `instance_type` parameter added. Confirmed via v1 API test — `instanceType` in the trigger payload overrides the YAML setting. |
| `update_variable` / `delete_variable` | ✓ complete | CRUD completeness for variable management. |
| `list_caches` / `delete_cache` | ✓ complete | Available via v1 API (`/apps/{id}/caches`). `delete_cache` accepts an optional `cache_id` — omit to delete all. |
| `create_public_artifact_url` | ✓ complete | Available via v1 API (`POST /artifacts/{secureFilename}/public-url`). Accepts an artifact URL from `get_build`/`wait_for_build` and an `expires_in_hours` parameter (default 24). |

### White-label / matrix builds

Inspired by the Codemagic dynamic workflows pattern: one `codemagic.yaml` workflow triggered N times with different variable sets to produce N differently-branded artifacts (bundle ID, app name, branding URLs, signing identity). Common for white-label apps and multi-flavor Android builds.

| Tool | Notes |
|---|---|
| `trigger_build_matrix` | Accepts a base trigger config + a list of variable sets. Fires one build per set in parallel, returns all build IDs immediately. The agent then polls each with `wait_for_build`. |

### Rethinking build status polling

The current `wait_for_build` design has a fundamental impedance mismatch: MCP clients timeout in ~60 seconds, but a Codemagic build machine takes 45–60 seconds just to spin up. With a 30-second polling interval, the tool gets at most one status check before hitting the timeout — and that check almost always returns "still building" because the machine hasn't even started executing yet.

✓ **Resolved.** `wait_for_build` is now a single-check tool — it calls `getBuild` once and returns immediately. Non-terminal status returns "call again with the same build_id"; terminal status returns full details and artifacts. The agent controls retry cadence. The description explicitly tells agents that 20+ calls across a 10–40 minute build is normal.

**Medium term:** MCP streaming responses let a single tool call emit status updates over time — no repeated calls, no client-side timeout. Worth tracking the MCP spec here.

**Phase 5 (hosted) fully solves this:** the hosted server can maintain server-side build-monitoring jobs. `trigger_build` registers a job; `wait_for_build` polls the job's resolved state server-side. The agent gets build completion without holding a connection open for 40 minutes. Codemagic already has this infrastructure.

### Long-running App Store operations

✓ **Resolved.** `publish_to_app_store` (the 40-minute blocking call) has been replaced by two fast tools:
1. **`upload_build_to_asc`** — `asc builds upload` (no `--wait`), returns in ~2-5 minutes once the upload commits.
2. **`submit_for_app_store_review`** — `asc review submit`, attaches the VALID build to the version and submits for review. Near-instant.

Apple's processing time (10–30 min) is now handled by the agent polling `list_asc_builds` between the two calls — the same re-entrant pattern as `wait_for_build`. The `/ios_release` prompt updated to reflect the new 16-step flow.

---

## Phase 3 — Store presence (listings & assets)

*After the loop works, make the store listing itself agent-manageable.*

- ✓ **Store listing text** — iOS via `asc metadata pull/validate/apply`; Android via
  direct `edits.listings` API (google-play CLI has no listing support). New
  `androidpublisher.ts` client handles service account JWT auth, edit lifecycle, and
  PATCH. Tools: `get_ios_store_listing`, `set_ios_store_listing`,
  `get_android_store_listing`, `set_android_store_listing`.
- ✓ **Screenshot upload** — iOS via `asc screenshots upload` (fan-out mode, locale
  subdir); Android via `edits.images` simple upload with `?uploadType=media`. Both
  accept individual artifact URLs from Codemagic builds. Tools:
  `list_ios_screenshot_types`, `upload_ios_screenshots`, `upload_android_screenshots`.
- ✓ **Screenshot capture templates** — three new `codemagic.yaml` templates:
  - `ios-screenshots` — Maestro + iOS simulator on `mac_mini_m2`
  - `android-screenshots` — Maestro + Android emulator on `linux_x2`
  - `flutter-screenshots` — Flutter golden tests at store dimensions (no simulator)
  - Screenshot filenames encode locale and device type (`screenshots/{locale}/{device_type}/`)
    so the agent can route artifact URLs to the correct upload call without guessing.
  - Maestro chosen over fastlane snapshot: YAML-based flows, cross-platform, lower barrier.
- **Caption/frame pipeline** — deferred. `asc screenshots frame` is experimental;
  store policy requires screenshots to reflect the real app. Deferred until the
  experimental commands stabilise.
- **Data safety form (Android)** — `applications.dataSafety` accepts the CSV
  declaration via API; one of the few compliance forms that IS automatable. Not yet
  implemented.

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
