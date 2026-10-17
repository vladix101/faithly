// Test helpers: a simulated browser subscription and RFC 8291 decryption, so tests can prove
// that what the Worker sends is a valid, decryptable Web Push message signed with our VAPID key.
export const b64url = (b: ArrayBuffer | Uint8Array) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString('base64url');
export const fromB64url = (s: string) => new Uint8Array(Buffer.from(s, 'base64url'));

export async function vapidKeys() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  return { publicKey: b64url(await crypto.subtle.exportKey('raw', kp.publicKey)), privateKey: jwk.d as string, verifyKey: kp.publicKey };
}

/** What PushManager.subscribe() would produce in a browser. */
export async function browserSubscription(endpoint: string) {
  const kp = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const publicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  return { endpoint, keys: { p256dh: b64url(publicRaw), auth: b64url(auth) }, privateKey: kp.privateKey, publicRaw, auth };
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

/** Decrypts an aes128gcm Web Push body with the subscription's private key (RFC 8291 §3.4, RFC 8188). */
export async function decryptPush(body: Uint8Array, sub: Awaited<ReturnType<typeof browserSubscription>>): Promise<string> {
  const salt = body.slice(0, 16);
  const idLen = body[20];
  const serverPublic = body.slice(21, 21 + idLen);
  const ciphertext = body.slice(21 + idLen);
  const serverKey = await crypto.subtle.importKey('raw', serverPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: serverKey }, sub.privateKey, 256));
  const keyInfo = new Uint8Array([...new TextEncoder().encode('WebPush: info\0'), ...sub.publicRaw, ...serverPublic]);
  const ikm = await hkdf(sub.auth, shared, keyInfo, 32);
  const cek = await hkdf(salt, ikm, new TextEncoder().encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, new TextEncoder().encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext));
  let end = plain.length - 1;
  while (end >= 0 && plain[end] === 0) end--; // strip padding
  if (plain[end] !== 2) throw new Error('missing last-record delimiter');
  return new TextDecoder().decode(plain.slice(0, end));
}

/** Verifies the VAPID JWT in the Authorization header against our public key. */
export async function verifyVapid(authorization: string, verifyKey: CryptoKey): Promise<Record<string, unknown>> {
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(authorization);
  if (!m) throw new Error(`bad authorization header: ${authorization}`);
  const [h, p, s] = m[1].split('.');
  const ok = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    verifyKey,
    fromB64url(s),
    new TextEncoder().encode(`${h}.${p}`),
  );
  if (!ok) throw new Error('VAPID signature invalid');
  return JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
}

export interface Captured {
  url: string;
  headers: Record<string, string>;
  body: Uint8Array;
}

/** fetch stand-in for a push service: records requests and answers with the given status. */
export function fakePushService(status: number | (() => number), body: string | null = null) {
  const calls: Captured[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({
      url,
      headers: Object.fromEntries(Object.entries(init.headers as Record<string, string>)),
      body: new Uint8Array(init.body as ArrayBuffer),
    });
    const code = typeof status === 'function' ? status() : status;
    return new Response(code === 204 ? null : body, { status: code });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}
