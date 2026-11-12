import type { IncomingHttpHeaders } from "node:http";
import { z } from "zod";

const keySchema = z.string().min(8).max(128);

export function readIdempotencyKey(headers: IncomingHttpHeaders): string | null {
  const raw = headers["idempotency-key"];
  const parsed = keySchema.safeParse(Array.isArray(raw) ? raw[0] : raw);
  return parsed.success ? parsed.data : null;
}
