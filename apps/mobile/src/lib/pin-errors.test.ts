import { describe, expect, it } from "vitest";
import { ApiError } from "./api-client";
import { isPinError, pinErrorKind } from "./pin-errors";

describe("pinErrorKind", () => {
  it("mapeia cada código de PIN da API", () => {
    expect(pinErrorKind(new ApiError(403, "invalid_pin", "x"))).toBe("invalid");
    expect(pinErrorKind(new ApiError(429, "pin_locked", "x"))).toBe("locked");
    expect(pinErrorKind(new ApiError(403, "pin_not_set", "x"))).toBe("not_set");
    expect(pinErrorKind(new ApiError(400, "pin_required", "x"))).toBe("required");
    expect(pinErrorKind(new ApiError(400, "invalid_pin_format", "x"))).toBe("format");
  });

  it("isPinError é verdadeiro só para erros de PIN", () => {
    expect(isPinError(new ApiError(403, "invalid_pin", "x"))).toBe(true);
    expect(isPinError(new ApiError(422, "insufficient_funds", "x"))).toBe(false);
  });

  it("erros da API que não são do PIN devolvem null", () => {
    for (const code of [
      "insufficient_funds",
      "too_many_operations",
      "withdrawal_cooldown",
      "recent_login_required",
      "network_error",
      "unauthorized",
    ]) {
      expect(pinErrorKind(new ApiError(400, code, "x"))).toBeNull();
    }
  });

  it("erros que não vêm da API devolvem null, mesmo que tenham um campo code igual", () => {
    for (const value of [new Error("x"), "invalid_pin", null, undefined, { code: "invalid_pin" }, 42]) {
      expect(pinErrorKind(value)).toBeNull();
    }
  });

  it("códigos que coincidem com propriedades de objetos devolvem null", () => {
    for (const code of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      expect(pinErrorKind(new ApiError(400, code, "x"))).toBeNull();
    }
  });

  it("só conta o código, não o estado HTTP", () => {
    expect(pinErrorKind(new ApiError(500, "invalid_pin", "x"))).toBe("invalid");
    expect(pinErrorKind(new ApiError(403, "forbidden", "x"))).toBeNull();
  });
});
