import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Small secrets that have to live in the database rather than the environment.
 *
 * The Meta token is the case this exists for: the production server takes its environment from a
 * systemd file that only SSH can change, so a token kept in `META_ACCESS_TOKEN` cannot be replaced
 * from the browser. The database is shared between the local machine and production, so a token
 * stored there works in both the moment it is saved.
 *
 * It is encrypted rather than stored plainly, with a key derived from `SESSION_SECRET`, which lives
 * only in the environment. A copy of the database on its own therefore does not reveal the token.
 */

const ALGORITHM = "aes-256-gcm";
const PREFIX = "enc.v1.";

function key(): Buffer {
  const secret = process.env.SESSION_SECRET ?? "";
  if (secret.length < 16) throw new Error("SESSION_SECRET орнатылмаған — құпияны шифрлау мүмкін емес.");
  return Buffer.from(hkdfSync("sha256", secret, "payroll-secrets", "meta-token", 32));
}

/** Encrypts a value for storage. The result carries its own nonce and authentication tag. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + [iv, cipher.getAuthTag(), body].map(b => b.toString("base64url")).join(".");
}

/**
 * Decrypts a stored value. A value written before encryption existed, or one from a different
 * `SESSION_SECRET`, returns null rather than throwing: the caller treats it as «no token».
 */
export function decryptSecret(stored: string): string | null {
  if (!stored.startsWith(PREFIX)) return null;
  const [rawIv, rawTag, rawBody] = stored.slice(PREFIX.length).split(".");
  if (!rawIv || !rawTag || !rawBody) return null;
  try {
    const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(rawIv, "base64url"));
    decipher.setAuthTag(Buffer.from(rawTag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(rawBody, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** True when a stored value is in the encrypted form this module writes. */
export const isEncrypted = (value: string) => value.startsWith(PREFIX);
