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
