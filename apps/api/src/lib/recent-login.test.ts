import { describe, expect, it } from "vitest";
import { isRecentSignIn } from "./recent-login.js";

const NOW = new Date("2026-11-13T12:00:00.000Z");

describe("isRecentSignIn", () => {
  it("aceita um login de há 5 minutos", () => {
    expect(isRecentSignIn("2026-11-13T11:55:00.000Z", NOW)).toBe(true);
  });

  it("aceita exatamente no limite de 10 minutos", () => {
    expect(isRecentSignIn("2026-11-13T11:50:00.000Z", NOW)).toBe(true);
  });

  it("recusa depois do limite", () => {
    expect(isRecentSignIn("2026-11-13T11:49:59.000Z", NOW)).toBe(false);
  });

  it("recusa valores ausentes", () => {
    expect(isRecentSignIn(null, NOW)).toBe(false);
    expect(isRecentSignIn(undefined, NOW)).toBe(false);
    expect(isRecentSignIn("", NOW)).toBe(false);
  });

  it("recusa datas inválidas", () => {
    expect(isRecentSignIn("ontem", NOW)).toBe(false);
  });

  it("aceita um pequeno desvio de relógio para o futuro", () => {
    expect(isRecentSignIn("2026-11-13T12:00:30.000Z", NOW)).toBe(true);
  });

  it("recusa datas muito no futuro", () => {
    expect(isRecentSignIn("2026-11-13T12:05:00.000Z", NOW)).toBe(false);
  });
});
