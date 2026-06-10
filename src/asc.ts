import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";

const execFileAsync = promisify(execFile);

const EXEC_BUFFER = 32 * 1024 * 1024;     // 32 MB — covers large build/app lists
const UPLOAD_TIMEOUT_MS = 30 * 60 * 1000; // 30 min — upload + Apple processing wait
const CLI_TIMEOUT_MS = 60_000;             // 60 s  — list / status commands

/**
 * Run an `asc` CLI command and parse its JSON output.
 * Requires ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY_B64, and ASC_BYPASS_KEYCHAIN=1
 * to be set in the environment.
 * @param args - CLI arguments, e.g. ["apps", "list"].
 * @returns Parsed JSON response from the CLI.
 */
export async function runAsc<T>(args: string[]): Promise<T> {
  try {
    const { stdout } = await execFileAsync("asc", [...args, "--output", "json"], {
      maxBuffer: EXEC_BUFFER,
      timeout: CLI_TIMEOUT_MS,
    });
    return JSON.parse(stdout) as T;
  } catch (error) {
    throw new Error(`asc ${args[0]} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export interface AscAppRaw {
  id: string;
  attributes: {
    name: string;
    bundleId: string;
    sku: string;
  };
}

export interface AscApp {
  id: string;
  name: string;
  bundleId: string;
}

/** List all apps in App Store Connect. */
export async function listAscApps(): Promise<AscApp[]> {
  const response = await runAsc<{ data: AscAppRaw[] }>(["apps", "list"]);
  return response.data.map(app => ({
    id: app.id,
    name: app.attributes.name,
    bundleId: app.attributes.bundleId,
  }));
}

interface AscBuildRaw {
  id: string;
  attributes: {
    version: string;
    uploadedDate: string;
    processingState: string;
    expired: boolean;
  };
}

export interface AscBuild {
  id: string;
  version: string;
  uploadedDate: string;
  processingState: string;
  expired: boolean;
}

/**
 * List TestFlight builds for an app in App Store Connect.
 * @param appId - The App Store Connect app ID.
 */
export async function listAscBuilds(appId: string): Promise<AscBuild[]> {
  const response = await runAsc<{ data: AscBuildRaw[] }>(["builds", "list", "--app", appId]);
  return response.data.map(b => ({
    id: b.id,
    version: b.attributes.version,
    uploadedDate: b.attributes.uploadedDate,
    processingState: b.attributes.processingState,
    expired: b.attributes.expired,
  }));
}

interface AscBetaGroupRaw {
  id: string;
  attributes: {
    name: string;
    isInternalGroup?: boolean;
    feedbackEnabled: boolean;
  };
}

export interface AscBetaGroup {
  id: string;
  name: string;
  isInternalGroup: boolean;
  feedbackEnabled: boolean;
}

/**
 * List TestFlight beta groups for an app.
 * @param appId - The App Store Connect app ID.
 */
export async function listTestFlightGroups(appId: string): Promise<AscBetaGroup[]> {
  const response = await runAsc<{ data: AscBetaGroupRaw[] }>(["testflight", "groups", "list", "--app", appId]);
  return response.data.map(g => ({
    id: g.id,
    name: g.attributes.name,
    isInternalGroup: g.attributes.isInternalGroup ?? false,
    feedbackEnabled: g.attributes.feedbackEnabled,
  }));
}

export interface AscReviewStatus {
  appId: string;
  reviewState: string;
  nextAction: string;
  blockers: string[];
  version: {
    id: string;
    version: string;
    platform: string;
    state: string;
  } | null;
}

/**
 * Get the current App Store review status for an app.
 * @param appId - The App Store Connect app ID.
 */
export async function getReviewStatus(appId: string): Promise<AscReviewStatus> {
  return runAsc<AscReviewStatus>(["review", "status", "--app", appId]);
}

export interface AscReleaseStatus {
  app: {
    id: string;
    bundleId: string;
    name: string;
  };
  summary: {
    health: string;
    nextAction: string;
    blockers: string[];
  };
  builds: {
    latest: {
      version: string;
      buildNumber: string;
      processingState: string;
      uploadedDate: string;
    } | null;
  };
  testflight: {
    betaReviewState: string;
    submittedDate: string;
  } | null;
  appstore: {
    version: string;
    state: string;
    platform: string;
  } | null;
  submission: {
    inFlight: boolean;
    blockingIssues: string[];
  };
}

/**
 * Get a full release pipeline status for an app — builds, TestFlight, App Store, and submission state.
 * @param appId - The App Store Connect app ID.
 */
export async function getReleaseStatus(appId: string): Promise<AscReleaseStatus> {
  return runAsc<AscReleaseStatus>(["status", "--app", appId]);
}

/**
 * Run a preflight readiness check for an App Store version.
 * Returns an ordered remediation plan — the first item is the next thing to fix.
 * @param appId - The App Store Connect app ID.
 * @param version - App Store version string e.g. "1.2.3".
 */
export async function validateAppSubmission(appId: string, version: string): Promise<unknown> {
  return runAsc<unknown>(["validate", "--app", appId, "--version", version]);
}

/**
 * Download an IPA from a URL and upload it to TestFlight.
 * The IPA is saved to a temp file, uploaded via the asc CLI, then deleted.
 * @param appId - The App Store Connect app ID.
 * @param ipaUrl - Direct download URL for the IPA (e.g. a Codemagic artifact URL).
 * @param betaGroup - Optional TestFlight beta group name to distribute to after upload.
 */
export async function uploadToTestFlight(
  appId: string,
  ipaUrl: string,
  betaGroup?: string
): Promise<string> {
  const tempPath = join(tmpdir(), `cm-${randomUUID()}.ipa`);

  const response = await fetch(ipaUrl);
  if (!response.ok) {
    throw new Error(`Failed to download IPA: ${response.status} ${response.statusText}`);
  }
  if (!response.body) throw new Error("IPA response body is empty");
  await pipeline(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(tempPath));

  try {
    const args = ["builds", "upload", "--app", appId, "--ipa", tempPath, "--wait"];
    if (betaGroup) args.push("--group", betaGroup);
    const { stdout } = await execFileAsync("asc", args, {
      maxBuffer: EXEC_BUFFER,
      timeout: UPLOAD_TIMEOUT_MS,
    });
    return stdout;
  } finally {
    await unlink(tempPath).catch(() => { });
  }
}

/**
 * Download an IPA from a URL and publish it to the App Store via the asc CLI.
 * Uploads the IPA, waits for build processing, creates/finds the App Store version,
 * and attaches the build. Pass submitForReview=true to also submit for review.
 * @param appId - The App Store Connect app ID.
 * @param ipaUrl - Direct download URL for the IPA (e.g. a Codemagic artifact URL).
 * @param version - App Store version string (e.g. "1.2.3"). Defaults to version in IPA.
 * @param submitForReview - If true, submits for App Store review after attaching the build.
 */
export async function publishToAppStore(
  appId: string,
  ipaUrl: string,
  version?: string,
  submitForReview = false,
): Promise<string> {
  const tempPath = join(tmpdir(), `cm-${randomUUID()}.ipa`);

  const response = await fetch(ipaUrl);
  if (!response.ok) {
    throw new Error(`Failed to download IPA: ${response.status} ${response.statusText}`);
  }
  if (!response.body) throw new Error("IPA response body is empty");
  await pipeline(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(tempPath));

  try {
    const args = ["publish", "appstore", "--app", appId, "--ipa", tempPath, "--wait"];
    if (version) args.push("--version", version);
    if (submitForReview) args.push("--submit", "--confirm");
    const { stdout } = await execFileAsync("asc", args, {
      maxBuffer: EXEC_BUFFER,
      timeout: UPLOAD_TIMEOUT_MS,
    });
    return stdout;
  } finally {
    await unlink(tempPath).catch(() => {});
  }
}

/** Resolve a version string (e.g. "1.2.3") to its App Store version ID. */
async function getAppStoreVersionId(appId: string, version: string): Promise<string> {
  const result = await runAsc<{ data: Array<{ id: string }> }>(
    ["versions", "list", "--app", appId, "--version", version]
  );
  if (!result.data.length) throw new Error(`No App Store version found for ${version}`);
  return result.data[0].id;
}

export interface VersionMetadataFields {
  whatsNew?: string;
  description?: string;
  keywords?: string;
  promotionalText?: string;
  supportUrl?: string;
  marketingUrl?: string;
}

/**
 * Update App Store version localization metadata (What's New, description, keywords, etc.).
 * @param appId - The App Store Connect app ID.
 * @param version - Version string e.g. "1.2.3" — resolved to a version ID internally.
 * @param locale - BCP-47 locale e.g. "en-US", "de-DE", "zh-Hans".
 * @param fields - One or more fields to update.
 */
export async function setVersionMetadata(
  appId: string,
  version: string,
  locale: string,
  fields: VersionMetadataFields,
): Promise<unknown> {
  const versionId = await getAppStoreVersionId(appId, version);
  const args = ["localizations", "update", "--version", versionId, "--locale", locale];
  if (fields.whatsNew) args.push("--whats-new", fields.whatsNew);
  if (fields.description) args.push("--description", fields.description);
  if (fields.keywords) args.push("--keywords", fields.keywords);
  if (fields.promotionalText) args.push("--promotional-text", fields.promotionalText);
  if (fields.supportUrl) args.push("--support-url", fields.supportUrl);
  if (fields.marketingUrl) args.push("--marketing-url", fields.marketingUrl);
  return runAsc<unknown>(args);
}

/**
 * Set export compliance on a build.
 * Most apps only use standard HTTPS/TLS — set usesNonExemptEncryption=false.
 * Only set true if the app implements custom/proprietary encryption beyond standard protocols.
 * @param appId - The App Store Connect app ID.
 * @param usesNonExemptEncryption - false for HTTPS/TLS-only apps (most common); true for custom encryption.
 * @param buildId - Specific build ID to update. Defaults to the latest build for the app.
 */
export async function setExportCompliance(
  appId: string,
  usesNonExemptEncryption: boolean,
  buildId?: string,
): Promise<unknown> {
  const args = ["builds", "update"];
  if (buildId) {
    args.push("--build-id", buildId);
  } else {
    args.push("--app", appId, "--latest");
  }
  args.push(`--uses-non-exempt-encryption=${String(usesNonExemptEncryption)}`);
  return runAsc<unknown>(args);
}

/**
 * Release an App Store version that is in the "Pending Developer Release" state.
 * This makes the update publicly available immediately.
 * @param appId - The App Store Connect app ID.
 * @param version - Version string e.g. "1.2.3".
 */
export async function releaseVersion(appId: string, version: string): Promise<unknown> {
  const versionId = await getAppStoreVersionId(appId, version);
  return runAsc<unknown>(["versions", "release", "--version-id", versionId, "--confirm"]);
}

/**
 * Manage a phased rollout for an App Store version.
 * @param appId - The App Store Connect app ID.
 * @param version - Version string e.g. "1.2.3".
 * @param action - "create": set up phased rollout before submission.
 *                 "pause": pause an in-progress rollout.
 *                 "resume": resume a paused rollout.
 *                 "complete": release to all users immediately.
 */
export async function setPhasedRelease(
  appId: string,
  version: string,
  action: "create" | "pause" | "resume" | "complete",
): Promise<unknown> {
  const versionId = await getAppStoreVersionId(appId, version);
  if (action === "create") {
    return runAsc<unknown>(["versions", "phased-release", "create", "--version-id", versionId]);
  }
  const phasedRelease = await runAsc<{ id: string }>(
    ["versions", "phased-release", "view", "--version-id", versionId]
  );
  const state = action === "pause" ? "PAUSED" : action === "resume" ? "ACTIVE" : "COMPLETE";
  return runAsc<unknown>(["versions", "phased-release", "update", "--id", phasedRelease.id, "--state", state]);
}

/**
 * Submit a build for TestFlight beta app review.
 * Required before external beta groups can access the build.
 * @param buildId - The App Store Connect build ID (from list_asc_builds).
 */
export async function submitBetaReview(buildId: string): Promise<unknown> {
  return runAsc<unknown>(["testflight", "review", "submit", "--build-id", buildId, "--confirm"]);
}

/**
 * Add a tester to TestFlight by email, optionally to a specific group.
 * @param appId - The App Store Connect app ID.
 * @param email - Tester email address.
 * @param group - Group name or ID to add the tester to (optional).
 */
export async function addTestFlightTester(
  appId: string,
  email: string,
  group?: string,
): Promise<unknown> {
  const args = ["testflight", "testers", "add", "--app", appId, "--email", email];
  if (group) args.push("--group", group);
  return runAsc<unknown>(args);
}

/**
 * Create a new TestFlight beta group for an app.
 * @param appId - The App Store Connect app ID.
 * @param name - Display name for the group.
 * @param internal - If true, creates an internal group (Apple employees/org members only).
 */
export async function createTestFlightGroup(
  appId: string,
  name: string,
  internal = false,
): Promise<unknown> {
  const args = ["testflight", "groups", "create", "--app", appId, "--name", name];
  if (internal) args.push("--internal");
  return runAsc<unknown>(args);
}