/**
 * AES-GCM encryption compatible with the Java EncryptionUtil: the key is the UTF-8 bytes of
 * AES_SECRET_KEY, the payload is base64(iv[12] || ciphertext || tag[16]).
 * The legacy AES/ECB fallback is not supported (WebCrypto has no ECB); such values decrypt to "".
 */

const IV_LENGTH = 12;
const keyCache = new Map<string, Promise<CryptoKey>>();

function importKey(secret: string): Promise<CryptoKey> {
  if (!secret) throw new Error("AES secret key is not configured.");
  let key = keyCache.get(secret);
  if (!key) {
    key = crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "AES-GCM", false, [
      "encrypt",
      "decrypt",
    ]);
    keyCache.set(secret, key);
  }
  return key;
}

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function encrypt(secret: string, value: string | null | undefined): Promise<string> {
  if (value === null || value === undefined) return "";
  const key = await importKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const enc = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value)),
  );
  const combined = new Uint8Array(iv.length + enc.length);
  combined.set(iv);
  combined.set(enc, iv.length);
  return toBase64(combined);
}

export async function decrypt(secret: string, value: string | null | undefined): Promise<string> {
  if (!value || !value.trim()) return "";
  try {
    const key = await importKey(secret);
    const bytes = fromBase64(value);
    if (bytes.length < IV_LENGTH) return "";
    const dec = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.subarray(0, IV_LENGTH) },
      key,
      bytes.subarray(IV_LENGTH),
    );
    return new TextDecoder().decode(dec);
  } catch (e) {
    console.error("Error while decrypting", e);
    return "";
  }
}
