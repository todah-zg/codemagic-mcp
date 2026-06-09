import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);


async function runGooglePlay<T>(args: string[]): Promise<T> {
  try {
    const { stdout } = await execFileAsync("google-play", [...args, "--json"]);
    // Some commands print a human-readable summary line before the JSON.
    // Find the first [ or { and parse from there.
    const jsonStart = stdout.search(/[\[{]/);
    if (jsonStart === -1) throw new Error("No JSON found in output");
    return JSON.parse(stdout.slice(jsonStart)) as T;
  } catch (error) {
    throw new Error(
      `google-play ${args[0]} failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}


interface GooglePlayRelease {
  status: string;
  name: string;
  versionCodes: string[];
  releaseNotes?: { language: string; text: string }[];
}

export interface GooglePlayTrack {
  track: string;
  releases?: GooglePlayRelease[];
}

export async function listTracks(packageName: string): Promise<GooglePlayTrack[]> {
  return runGooglePlay<GooglePlayTrack[]>(["tracks", "list", "--package-name", packageName]);
}


export interface GooglePlayBundle {
  versionCode: number;
  sha1: string;
  sha256: string;
}

export async function listBundles(packageName: string): Promise<GooglePlayBundle[]> {
  return runGooglePlay<GooglePlayBundle[]>(["bundles", "list", "--package-name", packageName]);
}


export async function uploadToGooglePlay(
  aabUrl: string,
  track: string,
  releaseName?: string,
  releaseNotes?: string,
  releaseNotesLanguage?: string,
  draft?: boolean,
): Promise<string> {
  const tempPath = join(tmpdir(), `codemagic-${Date.now()}.aab`);

  const response = await fetch(aabUrl);
  if (!response.ok) {
    throw new Error(`Failed to download AAB: ${response.status} ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  await writeFile(tempPath, Buffer.from(buffer));

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