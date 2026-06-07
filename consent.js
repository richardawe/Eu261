/**
 * EU261 Claim Agent — Consent token generator (Phase 11: Agent API).
 * ECDSA P-256 key generation and JWT signing in the browser.
 * Private key never leaves the user’s device.
 */

export async function generateKeyPair() {
  return window.crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]
  );
}

export async function exportPublicKeyJwk(keyPair) {
  return window.crypto.subtle.exportKey("jwk", keyPair.publicKey);
}

export async function exportPrivateKeyJwk(keyPair) {
  return window.crypto.subtle.exportKey("jwk", keyPair.privateKey);
}

export async function importPrivateKeyJwk(jwk) {
  return window.crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

export async function generateConsentToken(keyOrPair, claims) {
  const privateKey = keyOrPair.privateKey ?? keyOrPair;
  const now = Math.floor(Date.now() / 1000);
  const header  = { alg: "ES256", typ: "JWT" };
  const payload = {
    sub: claims.sub, aud: claims.aud,
    max_value_eur: claims.max_value_eur,
    claims_count_max: claims.claims_count_max,
    iat: now, nbf: now,
    exp: now + (claims.validity_days ?? 90) * 86400,
  };
  const sigInput = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}`;
  const sig = await window.crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, privateKey, new TextEncoder().encode(sigInput)
  );
  return `${sigInput}.${b64uBuf(new Uint8Array(sig))}`;
}

export function decodeToken(token) {
  const [h, p] = token.split(".");
  return { header: JSON.parse(atob64u(h)), payload: JSON.parse(atob64u(p)) };
}

function b64u(str) { return b64uBuf(new TextEncoder().encode(str)); }
function b64uBuf(buf) {
  let s = "";
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");
}
function atob64u(s) {
  const p = s.replace(/-/g,"+").replace(/_/g,"/");
  return atob(p + "=".repeat((4 - p.length % 4) % 4));
}
