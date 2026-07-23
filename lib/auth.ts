import { cookies } from "next/headers";
import {
  ensureDatabase,
  getRawDb,
  getSetting,
  runtimeEnv,
} from "./database";

export const SESSION_COOKIE = "payroll_session";
const SESSION_SECONDS = 60 * 60 * 12;
const HASH_ITERATIONS = 100_000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function hexToBytes(value: string): Uint8Array {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) {
    throw new Error("Invalid hex value");
  }
  return Uint8Array.from(
    value.match(/.{2}/g) ?? [],
    (pair) => Number.parseInt(pair, 16),
  );
}

async function pbkdf2(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: salt as BufferSource,
      iterations,
    },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, HASH_ITERATIONS);
  return `pbkdf2$${HASH_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const separator = storedHash.includes(".")
    ? "."
    : storedHash.includes(":")
      ? ":"
      : "$";
  const [algorithm, iterationValue, saltValue, hashValue] =
    storedHash.split(separator);
  if (algorithm !== "pbkdf2" || !iterationValue || !saltValue || !hashValue) {
    return false;
  }
  const iterations = Number(iterationValue);
  if (!Number.isInteger(iterations) || iterations < 50_000) return false;
  try {
    const decode = separator === "." ? hexToBytes : base64ToBytes;
    const actual = await pbkdf2(password, decode(saltValue), iterations);
    return constantTimeEqual(actual, decode(hashValue));
  } catch {
    return false;
  }
}

async function hmac(value: string): Promise<string> {
  const secret = runtimeEnv().SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET бапталмаған.");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return bytesToBase64(new Uint8Array(signature))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export async function configuredPasswordHash(): Promise<string | null> {
  await ensureDatabase();
  return (
    (await getSetting("password_hash")) ??
    runtimeEnv().APP_PASSWORD_HASH ??
    null
  );
}

export async function createSessionToken(): Promise<string> {
  const version = (await getSetting("session_version")) ?? "1";
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = `${version}.${expires}`;
  return `${payload}.${await hmac(payload)}`;
}

export async function verifySessionToken(token?: string | null): Promise<boolean> {
  if (!token) return false;
  const [version, expiresValue, signature] = token.split(".");
  if (!version || !expiresValue || !signature) return false;
  const expires = Number(expiresValue);
  if (!Number.isInteger(expires) || expires < Math.floor(Date.now() / 1000)) {
    return false;
  }
  const currentVersion = (await getSetting("session_version")) ?? "1";
  if (version !== currentVersion) return false;
  const expected = await hmac(`${version}.${expiresValue}`);
  return constantTimeEqual(
    new TextEncoder().encode(expected),
    new TextEncoder().encode(signature),
  );
}

export async function isPageAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function isRequestAuthenticated(request: Request): Promise<boolean> {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const token = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  return verifySessionToken(token);
}

export function sessionCookie(token: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`;
}

export function isSecureRequest(request: Request): boolean {
  const forwardedProtocol = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  return (
    forwardedProtocol === "https" ||
    new URL(request.url).protocol === "https:" ||
    process.env.NODE_ENV === "production"
  );
}

export async function changeSharedPassword(nextPassword: string): Promise<void> {
  if (nextPassword.length < 10) {
    throw new Error("Жаңа пароль кемінде 10 таңбадан тұруы керек.");
  }
  const currentVersion = Number((await getSetting("session_version")) ?? "1");
  const nextHash = await hashPassword(nextPassword);
  const db = getRawDb();
  const upsert = `INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`;
  await db.batch([
    db.prepare(upsert).bind("password_hash", nextHash),
    db.prepare(upsert).bind("session_version", String(currentVersion + 1)),
  ]);
}
