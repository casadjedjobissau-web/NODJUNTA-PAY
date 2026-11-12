import { describe, expect, it } from "vitest";
import { isValidBusinessName, merchantStatusHint, merchantStatusLabel } from "./merchant";

describe("merchant", () => {
  it("nomes dos estados", () => {
    expect(merchantStatusLabel("pending")).toBe("Em análise");
    expect(merchantStatusLabel("active")).toBe("Ativo");
    expect(merchantStatusLabel("suspended")).toBe("Suspenso");
  });

  it("cada estado tem uma explicação diferente", () => {
    const hints = (["pending", "active", "suspended"] as const).map(merchantStatusHint);
    expect(new Set(hints).size).toBe(3);
    for (const hint of hints) {
      expect(hint.length).toBeGreaterThan(0);
    }
  });

  it("isValidBusinessName aceita 2 a 120 caracteres", () => {
    expect(isValidBusinessName("Loja da Maria")).toBe(true);
    expect(isValidBusinessName("  Ab  ")).toBe(true);
    expect(isValidBusinessName("x".repeat(120))).toBe(true);
  });

  it("isValidBusinessName rejeita vazio, curto e demasiado longo", () => {
    expect(isValidBusinessName("")).toBe(false);
    expect(isValidBusinessName("   ")).toBe(false);
    expect(isValidBusinessName("A")).toBe(false);
    expect(isValidBusinessName("x".repeat(121))).toBe(false);
  });
});
