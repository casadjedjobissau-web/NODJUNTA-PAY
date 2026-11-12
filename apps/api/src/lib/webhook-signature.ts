import { createHmac, timingSafeEqual } from "node:crypto";

export const DEFAULT_TOLERANCE_SECONDS = 300;

export function signPayload(secret: string, timestamp: string, rawBody: Buffer | string): string {
  return createHmac("sha256", secret).update(`${timestamp}.`).update(rawBody).digest("hex");
}

export interface VerifyInput {
  secret: string;
  timestampHeader: string | undefined;
  signatureHeader: string | undefined;
  rawBody: Buffer;
  nowSeconds: number;
  toleranceSeconds?: number;
}

export function verifySignature(input: VerifyInput): boolean {
  const { secret, timestampHeader, signatureHeader, rawBody, nowSeconds } = input;
  const tolerance = input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;

  if (!timestampHeader || !signatureHeader) {
    return false;
  }
  if (!/^[0-9]{10}$/.test(timestampHeader)) {
    return false;
  }
  if (Math.abs(nowSeconds - Number(timestampHeader)) > tolerance) {
    return false;
  }
  if (!/^[0-9a-fA-F]{64}$/.test(signatureHeader)) {
    return false;
  }

  const expected = Buffer.from(signPayload(secret, timestampHeader, rawBody), "hex");
  const given = Buffer.from(signatureHeader, "hex");
  return given.length === expected.length && timingSafeEqual(expected, given);
}
