import type { Env } from "../env";
import { decrypt as aesDecrypt, encrypt as aesEncrypt } from "../lib/crypto";
import { RuntimeException } from "../lib/errors";

/**
 * Port of util/EncryptionUtil over lib/crypto.ts (AES-GCM, key = UTF-8 bytes of AES_SECRET_KEY,
 * payload base64(iv || ciphertext || tag)). The Java static methods read `aes.secretKey` from the
 * Spring environment; here the Worker env is passed explicitly. The legacy AES/ECB fallback of
 * decrypt() is not available on Workers (such values decrypt to "").
 */
type KeyEnv = Pick<Env, "AES_SECRET_KEY">;

/** "" for null; throws when the key is not configured (IllegalStateException in Java). */
export async function encrypt(env: KeyEnv, valueToEnc: string | null | undefined): Promise<string> {
  if (valueToEnc === null || valueToEnc === undefined) return "";
  if (!env.AES_SECRET_KEY) throw new RuntimeException("AES secret key is not configured.");
  return aesEncrypt(env.AES_SECRET_KEY, valueToEnc);
}

/** "" for blank input and for any decryption failure (logged), like the Java version. */
export async function decrypt(env: KeyEnv, encryptedValue: string | null | undefined): Promise<string> {
  if (!env.AES_SECRET_KEY) {
    console.error("AES secret key is not configured.");
    return "";
  }
  return aesDecrypt(env.AES_SECRET_KEY, encryptedValue);
}
