# Codemagic MCP Server — Project Context

## What we're building
An MCP server that gives AI agents a unified surface over **Codemagic CI/CD** *and*
**App Store Connect**, so an agent can take a mobile app from onboarding → build →
sign → publish in one coherent flow.

Framing: **composition, not circumvention.** Codemagic does what it is uniquely good
at (Mac-based build + signing); the agent + App Store Connect handle the reactive
App Store lifecycle. The server's job is to make Codemagic the *best platform for
agent-driven mobile CI/CD*. It must never reduce Codemagic to a commodity build farm.

## Architecture decisions (already made)
- **Single MCP server, two domains** (Codemagic CI/CD + App Store Connect). Not
  multiple servers — the workflows are too intertwined to split. The LLM is the
  orchestrator across tools; there is no need for a "central" coordinating server.
- **The batch/interactive seam:** `codemagic.yaml` handles the deterministic,
  repeatable work (build + sign). The agent handles the reactive work (TestFlight,
  metadata, submission, handling rejections) that fits a conversation rather than a
  one-shot pipeline.
- **iOS signing constraint:** signing requires macOS with the signing identity in a
  keychain — i.e. the Codemagic build machine. Do NOT design any flow that signs an
  `.ipa` off the build machine.
- **Don't re-host docs.** docs.codemagic.io is already AI-accessible (markdown serving
  via `Accept` header + `llms.txt`). Instead provide *dynamic* capability: a
  `codemagic.yaml` validator and current starter templates.

## Tech stack
- TypeScript on Node (current LTS — 20 or 22).
- Official MCP TypeScript SDK (`@modelcontextprotocol/sdk`).
- stdio transport for local dev; test tools with the **MCP Inspector**.
- **Deferred decisions:**
  1. ASC layer — wrap the `asc` CLI as a subprocess vs. call the App Store Connect
     API directly. Decide at milestone 5, with real context.
  2. HTTP / remote transport — later, and only if Codemagic decides to host it.

## Build order
1. **Hello-world MCP server** — one tool returning a static string. Prove the SDK +
   Inspector loop with zero domain complexity. ← we are here.
2. **First read-only tool** — `list_applications` (Codemagic API). Proves auth, a real
   HTTP call, and turning JSON into a tool result.
3. **Expand read-only coverage** — builds, build status, artifacts.
4. **First action** — `trigger_build`. Introduces the confirmation pattern for
   side-effecting tools.
5. **App Store / ASC layer** — TestFlight, metadata, submission.
6. **yaml authoring + validation** — onboarding, templates, `validate_codemagic_yaml`.

## Working agreement (this is a learning project — read carefully)
The developer is learning TypeScript. Strong background: Tcl (main language), plus
C++, C#, Java; OOP is solid; modules/imports/async are fine; new to Promises and the
JS/npm ecosystem. Therefore:
- **Explain the *why* before writing any code.**
- **One component at a time.** Run it and confirm it works before moving on.
- **The developer reviews or types each piece** — do NOT dump large finished chunks
  to be reverse-engineered later. Slower-but-understood beats fast-but-opaque.
- Read-only and safe tools first; consequential actions later.

## Resources & secrets
- A Codemagic API token is available; several demo apps exist to test against.
- Secrets (Codemagic token; later the App Store Connect `.p8`, key ID, issuer ID) live
  in **environment variables only** — never hardcoded, never committed, never pasted
  into a chat.
