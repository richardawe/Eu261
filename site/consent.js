/**
 * EU261 Claim Agent — Consent token generator (Phase 11: Agent API).
 *
 * Generates a signed JWT consent token that authorises an AI agent to file
 * claims on the user's behalf.  The private key is generated in the browser
 * using the Web Crypto API and NEVER leaves the user's device.  The public
 * key JWK must be registered with the claim agent separately.
 *
 * Token claims:
 *   sub              — user email
 *   aud              — agent identifier (who is authorised to use this token)
 *   max_value_eur    — maximum total compensation value the agent may claim
 *   claims_count_max — maximum number of claims per token
 *   iat, nbf, exp    — standard JWT timing claims
 *
 * Algorithm: ECDSA P-256 (ES256)
 */

// ─────────────────────────────────────────────
// Key management
// ─────────────────────────────────────────────

/**
 * Generate a new ECDSA P-256 key pair in the browser.
 * @returns {Promise<CryptoKeyPair>}
 */
export async function generateKeyPair() {
  return window.crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,          // extractable — we need to export the public key
    ["sign", "verify"]
  );
}

/**
 * Export the public key as a JWK object (safe to share / register).
 * @param {CryptoKeyPair} keyPair
 * @returns {Promise<object>}
 */
export async function exportPublicKeyJwk(keyPair) {
  return window.crypto.subtle.exportKey("jwk", keyPair.publicKey);
}

/**
 * Export the private key as a JWK object.
 * Keep this SECRET — store in sessionStorage or prompt user to download.
 * @param {CryptoKeyPair} keyPair
 * @returns {Promise<object>}
 */
export async function exportPrivateKeyJwk(keyPair) {
  return window.crypto.subtle.exportKey("jwk", keyPair.privateKey);
}

/**
 * Import a private key JWK (e.g. pasted back by the user from a saved file).
 * @param {object} jwk
 * @returns {Promise<CryptoKey>}
 */
export async function importPrivateKeyJwk(jwk) {
  return window.crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

// ─────────────────────────────────────────────
// JWT generation
// ─────────────────────────────────────────────

/**
 * Generate a signed consent JWT.
 *
 * @param {CryptoKey | CryptoKeyPair} keyOrPair  — private key or key pair
 * @param {object} claims
 * @param {string} claims.sub               — user email
 * @param {string} claims.aud               — agent identifier
 * @param {number} claims.max_value_eur     — max total compensation (EUR)
 * @param {number} claims.claims_count_max  — max number of claims
 * @param {number} [claims.validity_days=90] — token validity in days
 * @returns {Promise<string>} — compact JWT string
 */
export async function generateConsentToken(keyOrPair, claims) {
  const privateKey = keyOrPair.privateKey ?? keyOrPair;

  const now = Math.floor(Date.now() / 1000);
  const validityDays = claims.validity_days ?? 90;

  const header = { alg: "ES256", typ: "JWT" };
  const payload = {
    sub: claims.sub,
    aud: claims.aud,
    max_value_eur: claims.max_value_eur,
    claims_count_max: claims.claims_count_max,
    iat: now,
    nbf: now,
    exp: now + validityDays * 86400,
  };

  const headerB64   = base64urlEncode(JSON.stringify(header));
  const payloadB64  = base64urlEncode(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const signature = await window.crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(signingInput)
  );

  const sigB64 = base64urlEncodeBuffer(new Uint8Array(signature));
  return `${signingInput}.${sigB64}`;
}

/**
 * Decode and display a JWT's payload without verifying the signature.
 * For display purposes only — verification happens server-side.
 * @param {string} token
 * @returns {{ header: object, payload: object }}
 */
export function decodeToken(token) {
  const [headerB64, payloadB64] = token.split(".");
  return {
    header:  JSON.parse(base64urlDecode(headerB64)),
    payload: JSON.parse(base64urlDecode(payloadB64)),
  };
}

// ─────────────────────────────────────────────
// Base64url helpers
// ─────────────────────────────────────────────

function base64urlEncode(str) {
  return base64urlEncodeBuffer(new TextEncoder().encode(str));
}

function base64urlEncodeBuffer(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function base64urlDecode(str) {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (padded.length % 4)) % 4;
  return atob(padded + "=".repeat(padding));
}
