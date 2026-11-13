import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export interface HashParams {
  N: number;
  r: number;
  p: number;
}

export const DEFAULT_HASH_PARAMS: HashParams = { N: 16384, r: 8, p: 1 };

const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const MAX_MEMORY = 64 * 1024 * 1024;
const MIN_N = 16;
const MAX_N = 32768;

function isPowerOfTwo(value: number): boolean {
  return Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0;
}

function validParams(params: HashParams): boolean {
  return (
    isPowerOfTwo(params.N) &&
    params.N >= MIN_N &&
    params.N <= MAX_N &&
    Number.isInteger(params.r) &&
    params.r >= 1 &&
    params.r <= 8 &&
    Number.isInteger(params.p) &&
    params.p >= 1 &&
    params.p <= 4
  );
}

function deriveKey(secret: string, salt: Buffer, params: HashParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      secret,
      salt,
      KEY_LENGTH,
      { N: params.N, r: params.r, p: params.p, maxmem: MAX_MEMORY },
      (error, derived) => {
        if (error) {
          reject(error);
        } else {
          resolve(derived);
        }
      },
    );
  });
}

// A pimenta vive só no ambiente do servidor: uma cópia da tabela não chega para adivinhar PIN.
function prehash(pepper: string, userId: string, pin: string): string {
  return createHmac("sha256", pepper).update(`${userId}:${pin}`).digest("hex");
}

export async function hashPin(
  pepper: string,
  userId: string,
  pin: string,
  params: HashParams = DEFAULT_HASH_PARAMS,
): Promise<string> {
  if (!validParams(params)) {
    throw new Error("Parâmetros de hash inválidos");
  }
  const salt = randomBytes(SALT_LENGTH);
  const derived = await deriveKey(prehash(pepper, userId, pin), salt, params);
  return `scrypt$${params.N}$${params.r}$${params.p}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export async function verifyPin(
  pepper: string,
  userId: string,
  pin: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  const [scheme, nText, rText, pText, saltText, hashText] = parts;
  if (parts.length !== 6 || scheme !== "scrypt" || !saltText || !hashText) {
    return false;
  }

  const params: HashParams = { N: Number(nText), r: Number(rText), p: Number(pText) };
  if (!validParams(params)) {
    return false;
  }

  const salt = Buffer.from(saltText, "base64");
  const expected = Buffer.from(hashText, "base64");
  if (salt.length !== SALT_LENGTH || expected.length !== KEY_LENGTH) {
    return false;
  }

  try {
    const derived = await deriveKey(prehash(pepper, userId, pin), salt, params);
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
