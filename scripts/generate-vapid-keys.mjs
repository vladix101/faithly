#!/usr/bin/env node
// Generates a VAPID key pair for Web Push (P-256, base64url) with Web Crypto.
//   node scripts/generate-vapid-keys.mjs
// Public key → wrangler.jsonc "vars.VAPID_PUBLIC_KEY" (safe to publish).
// Private key → `npx wrangler secret put VAPID_PRIVATE_KEY` (never commit it).
// Changing the keys invalidates every existing browser subscription.
const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const raw = new Uint8Array(await crypto.subtle.exportKey('raw', publicKey));
const jwk = await crypto.subtle.exportKey('jwk', privateKey);
const b64url = (b) => Buffer.from(b).toString('base64url');
console.log(`VAPID_PUBLIC_KEY=${b64url(raw)}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
