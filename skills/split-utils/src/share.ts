// Share split output through encrypted links.
// Keep the key in the URL fragment behind a short human-friendly code.
// Send only ciphertext to the host.
// The paste URL is unguessable and hosts list no pastes, so a short
// code as second factor fits the low data sensitivity.

export interface ShareLink {
  url: string;
  keyFragment: string;
  link: string;
}

// Share codes hold six lowercase alphanumeric chars, like ab2x9k.
const CODE_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
// Codes hold six chars.
const CODE_LENGTH = 6;

// Name the client for paste host logs.
const USER_AGENT = "split-utils-share/1.0";

// Encode bytes as base64url text.
function encodeBase64Url(bytes: Uint8Array): string {
  // Build a binary string from the bytes.
  let binary = "";
  // Append one char per byte.
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  // Encode the binary string without padding.
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Decode base64url text back to bytes.
// Throw an error when the text breaks the rules.
function decodeBase64Url(text: string): Uint8Array {
  // Trim space from both ends.
  const clean = text.trim();
  // Reject text with chars outside the alphabet.
  if (clean.length === 0 || !/^[A-Za-z0-9\-_]+={0,2}$/.test(clean)) {
    // Throw a clear error for bad input.
    throw new Error("share blob is not valid base64url text");
  }
  // Swap URL chars back to base64 chars.
  let base64 = clean.replace(/-/g, "+").replace(/_/g, "/");
  // Pad the tail to a whole group.
  while (base64.length % 4 !== 0) base64 += "=";
  // Decode the base64 into a binary string.
  const binary = atob(base64);
  // Copy each char code into a byte.
  const out = new Uint8Array(binary.length);
  // Store one byte per char.
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  // Return the filled byte array.
  return out;
}

// Import raw bytes as an AES-GCM key.
function importShareKey(key: Uint8Array): Promise<CryptoKey> {
  // Copy the bytes into a fresh buffer.
  const copy = Uint8Array.from(key);
  // Import the copy for encrypt and decrypt use.
  return crypto.subtle.importKey("raw", copy.buffer, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

// Make 32 random bytes for a new share key.
export function generateShareKey(): Uint8Array {
  // Fill 32 bytes from the random source.
  return crypto.getRandomValues(new Uint8Array(32));
}

// Make a fresh six-char share code from the crypto random source.
export function generateShareCode(): string {
  // Draw one random byte per code char.
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  // Map each byte onto the 36-char alphabet with rejection sampling.
  // 256 mod 36 leaves a small tail, so redraw the few biased bytes.
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    // Redraw until the byte falls inside the unbiased span.
    let b = bytes[i];
    while (b >= 252) {
      b = crypto.getRandomValues(new Uint8Array(1))[0];
    }
    code += CODE_ALPHABET[b % 36];
  }
  return code;
}

// Turn a share code into a 32-byte AES key.
// PBKDF2 with a heavy iteration count makes each wrong-code guess
// cost real time, so a leaked blob resists brute force.
export async function codeToKey(code: string): Promise<Uint8Array> {
  // Derive 32 bytes through PBKDF2-SHA-256.
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(code),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      // A fixed salt blocks precomputed tables across shares.
      salt: new TextEncoder().encode("split-utils-share-v1"),
      iterations: 600_000,
      hash: "SHA-256",
    },
    material,
    256,
  );
  return new Uint8Array(bits);
}

// Encrypt text for share and return one opaque blob.
// Use AES-256-GCM with a random 12-byte IV.
// Return base64url of IV plus ciphertext and tag.
export async function encryptForShare(plaintext: string, key: Uint8Array): Promise<string> {
  // Reject keys without 32 bytes.
  if (key.length !== 32) throw new Error("share key must hold 32 bytes");
  // Make a random 12-byte IV.
  const iv = crypto.getRandomValues(new Uint8Array(12));
  // Import the raw key for encryption.
  const cryptoKey = await importShareKey(key);
  // Encode the plaintext as UTF-8 bytes.
  const data = new TextEncoder().encode(plaintext);
  // Encrypt the bytes with AES-GCM.
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv.buffer }, cryptoKey, data),
  );
  // Join IV and ciphertext into one buffer.
  const out = new Uint8Array(12 + cipher.length);
  // Copy the IV to the front.
  out.set(iv, 0);
  // Append the ciphertext after the IV.
  out.set(cipher, 12);
  // Encode the joined buffer as base64url.
  return encodeBase64Url(out);
}

// Decrypt a share blob back to plaintext.
// Throw a clear error on a wrong key or corrupt blob.
export async function decryptForShare(blob: string, key: Uint8Array): Promise<string> {
  // Reject keys without 32 bytes.
  if (key.length !== 32) throw new Error("share key must hold 32 bytes");
  // Hold the decoded bytes here.
  let raw: Uint8Array;
  // Parse the blob as base64url.
  try {
    raw = decodeBase64Url(blob);
  } catch {
    // Throw a clear error for corrupt input.
    throw new Error("share blob is corrupt and does not decode");
  }
  // Reject blobs too short to hold IV and data.
  if (raw.length <= 12) throw new Error("share blob is corrupt or cut short");
  // Copy the IV from the front.
  const iv = Uint8Array.from(raw.slice(0, 12));
  // Copy the ciphertext from the rest.
  const data = Uint8Array.from(raw.slice(12));
  // Import the raw key for decryption.
  const cryptoKey = await importShareKey(key);
  // Decrypt the bytes and report auth faults.
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv.buffer },
      cryptoKey,
      data.buffer,
    );
    // Decode the plain bytes as UTF-8 text.
    return new TextDecoder().decode(plain);
  } catch {
    // Throw a clear error for wrong keys.
    throw new Error("share decrypt failed with wrong key or corrupt blob");
  }
}

// Pause for a fixed count of milliseconds.
function sleep(ms: number): Promise<void> {
  // Resolve the promise after the timeout.
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Upload a blob to paste.rs and return the URL.
// Retry once after 3 seconds on rate limit.
// Return null when the upload fails.
async function uploadToPasteRs(blob: string): Promise<string | null> {
  // Try the POST up to two times.
  for (let attempt = 0; attempt < 2; attempt++) {
    // Hold the POST answer here.
    let res: Response;
    // Send the blob as the full body.
    try {
      res = await fetch("https://paste.rs/", {
        method: "POST",
        headers: { "User-Agent": USER_AGENT },
        body: blob,
      });
    } catch {
      // Treat net faults as failure.
      return null;
    }
    // Wait 3 seconds and retry once on rate limit.
    if (res.status === 429 && attempt === 0) {
      // Pause before the next attempt.
      await sleep(3000);
      // Move on to the retry attempt.
      continue;
    }
    // Reject codes outside plain success.
    if (res.status !== 200 && res.status !== 201) return null;
    // Trim space from the answer body.
    const text = (await res.text()).trim();
    // Reject answers without a plain URL.
    if (!text.startsWith("http")) return null;
    // Return the pasted page URL.
    return text;
  }
  // Report failure after both attempts.
  return null;
}

// Upload a blob to dpaste.com and return the URL.
// Return null when the upload fails.
async function uploadToDpaste(blob: string): Promise<string | null> {
  // Hold the POST answer here.
  let res: Response;
  // Send the blob as form fields.
  try {
    res = await fetch("https://dpaste.com/api/v2/", {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ content: blob, syntax: "text", expiry_days: "30" }),
    });
  } catch {
    // Treat net faults as failure.
    return null;
  }
  // Reject answers without a success code.
  // dpaste answers 201 Created, so accept the full 2xx range.
  if (!res.ok) return null;
  // Trim space from the answer body.
  const text = (await res.text()).trim();
  // Reject answers without a plain URL.
  if (!text.startsWith("http")) return null;
  // Return the pasted page URL.
  return text;
}

// Encrypt JSON text and share it through a paste host.
// Derive the key from a short code and keep the code in the fragment.
// Return the host URL plus the full link.
export async function createShareLink(jsonText: string): Promise<ShareLink> {
  // Make a fresh six-char code.
  const code = generateShareCode();
  // Derive the AES key from the code.
  const key = await codeToKey(code);
  // Encrypt the text into one opaque blob.
  const blob = await encryptForShare(jsonText, key);
  // Try the primary paste host first.
  const primary = await uploadToPasteRs(blob);
  // Keep the primary URL when present.
  let url = primary;
  // Fall back to the second host when needed.
  if (url === null) url = await uploadToDpaste(blob);
  // Throw a clear error when both hosts fail.
  if (url === null) {
    throw new Error("share upload failed on both hosts. Share the file directly instead.");
  }
  // Keep the code short in the fragment so links stay friendly.
  return { url, keyFragment: code, link: url + "#" + code };
}

// GET a URL and return the raw text.
// Retry once after a pause when the host throttles us.
// Throw a clear error when the fetch fails.
async function fetchText(url: string): Promise<string> {
  // Try the GET up to two times.
  for (let attempt = 0; attempt < 2; attempt++) {
    // Hold the GET answer here.
    let res: Response;
    // Send the request to the host.
    try {
      res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    } catch {
      // Throw a clear error for net faults.
      throw new Error("share fetch failed. Check the link and retry.");
    }
    // Return the body right away on success.
    if (res.ok) return await res.text();
    // Wait 20 seconds and retry once on throttle answers.
    // dpaste limits quick bursts from the same client shape.
    if (res.status === 429 && attempt === 0) {
      // Pause before the next attempt.
      await sleep(20000);
      // Move on to the retry attempt.
      continue;
    }
    // Give up with a clear error on other codes.
    throw new Error("share fetch failed with code " + res.status);
  }
  // Report failure after both attempts.
  throw new Error("share fetch failed with code 429");
}

// Test text for blob shape.
// Check the alphabet and the length.
function parsesAsBlob(text: string): boolean {
  // Trim space from both ends.
  const clean = text.trim();
  // Reject text with chars outside the alphabet.
  if (!/^[A-Za-z0-9\-_]+={0,2}$/.test(clean)) return false;
  // Decode the text and check the length.
  try {
    // Demand room for IV plus data.
    return decodeBase64Url(clean).length > 12;
  } catch {
    // Treat decode faults as a miss.
    return false;
  }
}

// Fetch a share link and decrypt the text.
// Read the key from the URL fragment.
// Retry with a .txt suffix for rendered pages.
export async function fetchShareLink(link: string): Promise<string> {
  // Find the key mark in the link.
  const hash = link.lastIndexOf("#");
  // Reject links without a key fragment.
  if (hash < 0) throw new Error("share link lacks a key fragment after #");
  // Take the host URL before the mark.
  const url = link.slice(0, hash);
  // Take the code text after the mark.
  const fragment = link.slice(hash + 1).trim();
  // Hold the key bytes here.
  let key: Uint8Array;
  // New links carry a six-char code. Old links carry a raw key.
  if (fragment.length === CODE_LENGTH && /^[0-9a-z]+$/.test(fragment)) {
    // Stretch the code into the AES key.
    key = await codeToKey(fragment);
  } else {
    // Parse the fragment as base64url for legacy links.
    let raw: Uint8Array;
    try {
      raw = decodeBase64Url(fragment);
    } catch {
      // Throw a clear error for a bad key.
      throw new Error("share link holds a bad key fragment");
    }
    // Reject keys without 32 bytes.
    if (raw.length !== 32) throw new Error("share link holds a short key fragment");
    key = raw;
  }
  // dpaste serves an HTML page at the bare URL and throttles bursts.
  // Fetch the raw .txt form in one request for that host.
  // Hold the blob text here.
  let blob: string;
  if (/^https:\/\/dpaste\.com\//.test(url)) {
    // GET the plain text form of the page.
    blob = (await fetchText(url + ".txt")).trim();
  } else {
    // GET the raw blob from the host.
    const first = (await fetchText(url)).trim();
    // Keep the first body as default.
    blob = first;
    // Retry with a .txt suffix for rendered pages.
    if (!parsesAsBlob(first)) {
      // GET the plain text form of the page.
      blob = (await fetchText(url + ".txt")).trim();
    }
  }
  // Decrypt the blob into plaintext.
  return await decryptForShare(blob, key);
}
