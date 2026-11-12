import { describe, expect, it } from "vitest";
import { OTP_LENGTH, isCompleteOtp, sanitizeOtp } from "./otp";

describe("otp", () => {
  it("sanitizeOtp remove tudo o que não é dígito", () => {
    expect(sanitizeOtp("12 34-56")).toBe("123456");
    expect(sanitizeOtp("abc")).toBe("");
  });

  it("sanitizeOtp limita ao comprimento do código", () => {
    expect(sanitizeOtp("12345678")).toHaveLength(OTP_LENGTH);
  });

  it("isCompleteOtp só aceita o código completo", () => {
    expect(isCompleteOtp("123456")).toBe(true);
    expect(isCompleteOtp("12345")).toBe(false);
    expect(isCompleteOtp("1234567")).toBe(false);
    expect(isCompleteOtp("12345a")).toBe(false);
  });
});
