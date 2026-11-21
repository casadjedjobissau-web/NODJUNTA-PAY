import { ApiError } from "./api-client";

export type PinErrorKind = "invalid" | "locked" | "not_set" | "required" | "format";

const KINDS: Readonly<Record<string, PinErrorKind>> = {
  invalid_pin: "invalid",
  pin_locked: "locked",
  pin_not_set: "not_set",
  pin_required: "required",
  invalid_pin_format: "format",
};

export function pinErrorKind(error: unknown): PinErrorKind | null {
  if (!(error instanceof ApiError)) {
    return null;
  }
  return Object.prototype.hasOwnProperty.call(KINDS, error.code) ? (KINDS[error.code] ?? null) : null;
}

export function isPinError(error: unknown): boolean {
  return pinErrorKind(error) !== null;
}
