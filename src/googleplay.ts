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

const EXEC_BUFFER = 32 * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 30 * 60 * 1000;
const CLI_TIMEOUT_MS = 60_000;

/**
 * Run a `google-play` CLI command and parse its JSON output.
 * Requires GOOGLE_PLAY_SERVICE_ACCOUNT_CREDENTIALS to be set in the environment
 * (raw JSON content of the service account key file).
 * Some commands print a human-readable summary line before the JSON — this
 * function handles that by finding the first [ or { in the output.
 * @param args - CLI arguments, e.g. ["tracks", "list", "--package-name", "com.example"].
 * @returns Parsed JSON response from the CLI.
 */
async function runGooglePlay<T>(args: string[]): Promise<T> {
  try {
    const { stdout } = await execFileAsync("google-play", [...args, "--json"], {
      maxBuffer: EXEC_BUFFER,
      timeout: CLI_TIMEOUT_MS,
    });
    const lines = stdout.split("\n");
    const startIdx = lines.findIndex(line => /^[\[{]/.test(line.trim()));
    if (startIdx === -1) throw new Error("No JSON found in output");
    return JSON.parse(lines.slice(startIdx).join("\n")) as T;
  } catch (error) {
    throw new Error(
      `google-play ${args[0]} failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}


export interface GooglePlayRelease {
  status: string;
  name: string;
  versionCodes: string[];
  releaseNotes?: { language: string; text: string }[];
}

export interface GooglePlayTrack {
  track: string;
  releases?: GooglePlayRelease[];
}

/**
 * List Google Play tracks for an app (internal, alpha, beta, production),
 * including release info for any track that has releases.
 * @param packageName - The Android package name, e.g. com.example.myapp.
 */
export async function listTracks(packageName: string): Promise<GooglePlayTrack[]> {
  return runGooglePlay<GooglePlayTrack[]>(["tracks", "list", "--package-name", packageName]);
}

export interface GooglePlayBundle {
  versionCode: number;
  sha1: string;
  sha256: string;
}

/**
 * List uploaded App Bundles (AAB) for an app on Google Play.
 * @param packageName - The Android package name, e.g. com.example.myapp.
 */
export async function listBundles(packageName: string): Promise<GooglePlayBundle[]> {
  return runGooglePlay<GooglePlayBundle[]>(["bundles", "list", "--package-name", packageName]);
}

/**
 * Download an AAB from a URL and publish it to a Google Play track.
 * The AAB is saved to a temp file, published via the google-play CLI, then deleted.
 * The package name is extracted from the AAB automatically — no need to provide it.
 * @param aabUrl - Direct download URL for the AAB (e.g. a Codemagic artifact URL).
 * @param track - Target track: internal, alpha, beta, or production.
 * @param releaseName - Optional release name. Defaults to the AAB's version name.
 * @param releaseNotes - Optional release notes as plain text.
 * @param releaseNotesLanguage - BCP-47 language tag for release notes (default: en-US).
 * @param draft - If true, upload as a draft release instead of publishing immediately.
 */
export async function uploadToGooglePlay(
  aabUrl: string,
  track: string,
  releaseName?: string,
  releaseNotes?: string,
  releaseNotesLanguage?: string,
  draft?: boolean,
): Promise<string> {
  const tempPath = join(tmpdir(), `cm-${randomUUID()}.aab`);

  const response = await fetch(aabUrl);
  if (!response.ok) {
    throw new Error(`Failed to download AAB: ${response.status} ${response.statusText}`);
  }
  if (!response.body) throw new Error("AAB response body is empty");
  await pipeline(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(tempPath));

  try {
    const args = ["bundles", "publish", "--bundle", tempPath, "--track", track];
    if (releaseName) args.push("--release-name", releaseName);
    if (releaseNotes) {
      const notes = JSON.stringify([{
        language: releaseNotesLanguage ?? "en-US",
        text: releaseNotes,
      }]);
      args.push("--release-notes", notes);
    }
    if (draft) args.push("--draft");

    const result = await runGooglePlay<unknown>(args);
    return JSON.stringify(result, null, 2);
  } finally {
    await unlink(tempPath).catch(() => { });
  }
}