import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number }
) => Promise<Buffer>;

const PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LEN = 64;

/** Gera `scrypt$N$r$p$saltHex$hashHex`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize("NFKC"), salt, KEY_LEN, PARAMS);
  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("hex"),
    derived.toString("hex"),
  ].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, n, r, p, saltHex, hashHex] = stored.split("$");
    if (scheme !== "scrypt") return false;

    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const derived = await scrypt(password.normalize("NFKC"), salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });

    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  issues: string[];
  ok: boolean;
}

export function checkPasswordStrength(password: string): PasswordStrength {
  const issues: string[] = [];
  if (password.length < 10) issues.push("Use pelo menos 10 caracteres");
  if (!/[a-z]/.test(password)) issues.push("Inclua uma letra minúscula");
  if (!/[A-Z]/.test(password)) issues.push("Inclua uma letra maiúscula");
  if (!/\d/.test(password)) issues.push("Inclua um número");

  let score = 0;
  if (password.length >= 10) score++;
  if (password.length >= 14) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password) && /[^\w\s]/.test(password)) score++;

  return {
    score: Math.min(score, 4) as PasswordStrength["score"],
    issues,
    ok: issues.length === 0,
  };
}
