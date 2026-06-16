import crypto from "node:crypto";

const SESSION_COOKIE = "vedisa_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

const ADMIN_EMAIL_DEFAULT = "jpmontero@vedisaremates.cl";
const ADMIN_PASSWORD_DEFAULT = "Vedisa123";

function getSessionSecret(): string {
  return process.env.ADMIN_EDITOR_SESSION_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "vedisa-editor-secret";
}

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payloadBase64: string): string {
  return crypto.createHmac("sha256", getSessionSecret()).update(payloadBase64).digest("base64url");
}

export function createAdminSessionToken(email: string): string {
  const payload = {
    email,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const payloadBase64 = toBase64Url(JSON.stringify(payload));
  const signature = signPayload(payloadBase64);
  return `${payloadBase64}.${signature}`;
}

export function verifyAdminSessionToken(token?: string | null): { valid: boolean; email?: string } {
  if (!token) return { valid: false };
  const [payloadBase64, signature] = token.split(".");
  if (!payloadBase64 || !signature) return { valid: false };

  const expectedSignature = signPayload(payloadBase64);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false };
  }

  try {
    const payload = JSON.parse(fromBase64Url(payloadBase64)) as { email?: string; exp?: number };
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return { valid: false };
    if (!payload.email) return { valid: false };
    return { valid: true, email: payload.email };
  } catch {
    return { valid: false };
  }
}

export function getAdminCredentials(): { email: string; password: string } {
  return {
    email: process.env.ADMIN_EDITOR_EMAIL ?? ADMIN_EMAIL_DEFAULT,
    password: process.env.ADMIN_EDITOR_PASSWORD ?? ADMIN_PASSWORD_DEFAULT,
  };
}

export const ADMIN_SESSION_COOKIE_NAME = SESSION_COOKIE;
