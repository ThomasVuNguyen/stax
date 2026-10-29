/**
 * Port of util/Util, plus small helpers reproducing java.lang.String semantics that the other
 * ported parsers rely on (javaTrim, javaSplit, JAVA_WS).
 */

const CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const HALF_LENGTH = 5;
const SHIFT = 2;
const REGEX_EMAIL = /\.(?=[^@]*@)/g;

/** `XXXXX-XXXXX` from [A-Za-z0-9] using a CSPRNG (SecureRandom in Java). */
export function generateRandomId(): string {
  const pick = () => {
    const buf = new Uint8Array(1);
    // Rejection sampling keeps the distribution uniform like SecureRandom.nextInt(62).
    for (;;) {
      crypto.getRandomValues(buf);
      if (buf[0] < 248) return CHARACTERS[buf[0] % CHARACTERS.length];
    }
  };
  let s = "";
  for (let i = 0; i < HALF_LENGTH; i++) s += pick();
  s += "-";
  for (let i = 0; i < HALF_LENGTH; i++) s += pick();
  return s;
}

/** Removes dots before '@' and lowercases. */
export function normalizeEmail(email: string): string {
  return email.replace(REGEX_EMAIL, "").toLowerCase();
}

/** Reversible id obfuscation: shifts every UTF-16 code unit by 2. */
export function encodeUserId(uuid: string): string {
  return transform(uuid, SHIFT);
}

function transform(input: string, shiftValue: number): string {
  let out = "";
  for (let i = 0; i < input.length; i++) out += String.fromCharCode((input.charCodeAt(i) + shiftValue) & 0xffff);
  return out;
}

// --- java.lang.String helpers ---

/** Java's default (non-UNICODE_CHARACTER_CLASS) `\s`. Use inside RegExp sources. */
export const JAVA_WS = "[ \\t\\n\\x0B\\f\\r]";

/** String.trim(): strips code units <= U+0020 from both ends. */
export function javaTrim(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && s.charCodeAt(start) <= 0x20) start++;
  while (end > start && s.charCodeAt(end - 1) <= 0x20) end--;
  return s.substring(start, end);
}

/** String.split(regex): like JS split but trailing empty strings are removed. */
export function javaSplit(s: string, regex: RegExp): string[] {
  const parts = s.split(regex);
  if (s.length === 0) return [""];
  while (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
  return parts;
}
