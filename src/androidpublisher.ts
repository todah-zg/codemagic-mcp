import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";

const PUBLISHER_BASE = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";
const UPLOAD_BASE = "https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/androidpublisher";

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

// Per-credential token cache — keyed by client_email so multiple service
// accounts in the same process (hosted multi-tenant) each get their own slot.
const tokenCache = new Map<string, TokenCache>();

async function parseCredentials(): Promise<ServiceAccount> {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_CREDENTIALS;
  if (!raw) throw new Error("GOOGLE_PLAY_SERVICE_ACCOUNT_CREDENTIALS is not set");
  const json = raw.startsWith("@file:") ? await readFile(raw.slice(6), "utf8") : raw;
  return JSON.parse(json) as ServiceAccount;
}

/**
 * Build and sign a JWT for the service account.
 * Format: base64url(header).base64url(payload).base64url(signature)
 */
function signJWT(clientEmail: string, privateKey: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss: clientEmail,
    scope: SCOPE,
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now,
  })).toString("base64url");
  const sign = createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(privateKey, "base64url");
  return `${header}.${payload}.${signature}`;
}

/**
 * Return a valid Bearer token, re-using the cached one if still fresh.
 */
async function getAccessToken(): Promise<string> {
  const { client_email, private_key } = await parseCredentials();
  const cached = tokenCache.get(client_email);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const jwt = signJWT(client_email, private_key);
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${text.slice(0, 200)}`);
  }
  const { access_token, expires_in } = await response.json() as { access_token: string; expires_in: number };
  tokenCache.set(client_email, { token: access_token, expiresAt: Date.now() + expires_in * 1000 });
  return access_token;
}

async function createEdit(token: string, packageName: string): Promise<string> {
  const response = await fetch(`${PUBLISHER_BASE}/${packageName}/edits`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`createEdit failed (${response.status}): ${text.slice(0, 200)}`);
  }
  const { id } = await response.json() as { id: string };
  return id;
}

async function commitEdit(token: string, packageName: string, editId: string): Promise<void> {
  const response = await fetch(`${PUBLISHER_BASE}/${packageName}/edits/${editId}:commit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`commitEdit failed (${response.status}): ${text.slice(0, 200)}`);
  }
}

/**
 * Best-effort edit abandonment — ignores errors so it is safe to call in a
 * finally block without masking the original error.
 */
async function abandonEdit(token: string, packageName: string, editId: string): Promise<void> {
  await fetch(`${PUBLISHER_BASE}/${packageName}/edits/${editId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
}

/**
 * Run a write operation inside a draft edit.
 * Commits on success; abandons the edit and re-throws on error.
 * @param packageName - Android package name (e.g. "com.example.app").
 * @param fn - Async function that performs mutations using the token and editId.
 */
async function withEdit<T>(
  packageName: string,
  fn: (token: string, editId: string) => Promise<T>
): Promise<T> {
  const token = await getAccessToken();
  const editId = await createEdit(token, packageName);
  try {
    const result = await fn(token, editId);
    await commitEdit(token, packageName, editId);
    return result;
  } catch (error) {
    await abandonEdit(token, packageName, editId);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface AndroidStoreListing {
  title?: string;
  shortDescription?: string;
  fullDescription?: string;
}

/**
 * Fetch the current store listing for a single language.
 * Creates a read-only draft edit that is always abandoned — never committed.
 * @param packageName - Android package name.
 * @param language - BCP-47 language tag (e.g. "en-US").
 */
export async function getAndroidStoreListing(
  packageName: string,
  language: string
): Promise<AndroidStoreListing> {
  const token = await getAccessToken();
  const editId = await createEdit(token, packageName);
  try {
    const response = await fetch(
      `${PUBLISHER_BASE}/${packageName}/edits/${editId}/listings/${language}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) }
    );
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`getListing failed (${response.status}): ${text.slice(0, 200)}`);
    }
    return await response.json() as AndroidStoreListing;
  } finally {
    await abandonEdit(token, packageName, editId);
  }
}

/**
 * Update the store listing for a single language.
 * Only the fields present in `listing` are sent — omitted fields are unchanged.
 * @param packageName - Android package name.
 * @param language - BCP-47 language tag (e.g. "en-US").
 * @param listing - Fields to update (title, shortDescription, fullDescription).
 */
export async function setAndroidStoreListing(
  packageName: string,
  language: string,
  listing: AndroidStoreListing
): Promise<void> {
  await withEdit(packageName, async (token, editId) => {
    const response = await fetch(
      `${PUBLISHER_BASE}/${packageName}/edits/${editId}/listings/${language}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(listing),
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`updateListing failed (${response.status}): ${text.slice(0, 200)}`);
    }
  });
}

/**
 * Upload screenshots to Google Play for a specific language and image type.
 * All uploads are batched inside a single edit — either everything commits or nothing does.
 * @param packageName - Android package name.
 * @param language - BCP-47 language tag (e.g. "en-US").
 * @param imageType - Image type e.g. "phoneScreenshots", "sevenInchScreenshots", "tenInchScreenshots".
 * @param screenshotUrls - URLs of screenshot images to upload (max 8 for phones).
 * @param replace - If true, delete all existing images of this type before uploading.
 */
export async function uploadAndroidScreenshots(
  packageName: string,
  language: string,
  imageType: string,
  screenshotUrls: string[],
  replace: boolean,
): Promise<void> {
  await withEdit(packageName, async (token, editId) => {
    if (replace) {
      const del = await fetch(
        `${PUBLISHER_BASE}/${packageName}/edits/${editId}/listings/${language}/images/${imageType}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) }
      );
      // 204 = deleted, 404 = nothing to delete — both are fine
      if (!del.ok && del.status !== 404) {
        const text = await del.text();
        throw new Error(`deleteImages failed (${del.status}): ${text.slice(0, 200)}`);
      }
    }

    for (let i = 0; i < screenshotUrls.length; i++) {
      const url = screenshotUrls[i];
      const imgResponse = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!imgResponse.ok) throw new Error(`Failed to download screenshot ${i + 1}: HTTP ${imgResponse.status}`);
      const contentType = imgResponse.headers.get("content-type") ?? "";
      const mimeType = contentType.startsWith("image/") ? contentType.split(";")[0] : "image/png";
      const imageData = await imgResponse.arrayBuffer();

      const upload = await fetch(
        `${UPLOAD_BASE}/${packageName}/edits/${editId}/listings/${language}/images/${imageType}?uploadType=media`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": mimeType },
          body: imageData,
          signal: AbortSignal.timeout(60_000),
        }
      );
      if (!upload.ok) {
        const text = await upload.text();
        throw new Error(`uploadImage ${i + 1} failed (${upload.status}): ${text.slice(0, 200)}`);
      }
    }
  });
}

/**
 * Submit the data safety declaration for a Google Play app.
 * Operates outside the edit lifecycle — takes effect immediately on success.
 * The CSV can be exported from Play Console → App content → Data safety → Export CSV,
 * then re-uploaded here when data practices change. There is no GET endpoint.
 * @param packageName - Android package name.
 * @param csv - Raw CSV string exported from the Play Console data safety form.
 */
export async function setAndroidDataSafety(packageName: string, csv: string): Promise<void> {
  const token = await getAccessToken();
  const response = await fetch(
    `${PUBLISHER_BASE}/${packageName}/dataSafety`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ safetyLabels: csv }),
      signal: AbortSignal.timeout(10_000),
    }
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`setDataSafety failed (${response.status}): ${text.slice(0, 200)}`);
  }
}
