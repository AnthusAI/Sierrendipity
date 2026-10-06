import { createHmac, timingSafeEqual } from "node:crypto";

export type SessionClaims = { sub: string; taskIp: string; exp: number };

const b64 = (b: Buffer) => b.toString("base64url");
const mac = (payload: string, key: string) => createHmac("sha256", key).update(payload).digest();

export function signSession(claims: SessionClaims, key: string): string {
  const payload = b64(Buffer.from(JSON.stringify(claims)));
  return `${payload}.${b64(mac(payload, key))}`;
}

/** Returns the claims, or null when the token is malformed, mis-signed or expired. */
export function verifySession(token: string, key: string, nowS: number): SessionClaims | null {
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined) return null;
  const given = Buffer.from(sig, "base64url");
  const expected = mac(payload, key);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const c = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof c.sub !== "string" || typeof c.taskIp !== "string" || typeof c.exp !== "number") return null;
    return c.exp > nowS ? c : null;
  } catch {
    return null;
  }
}
