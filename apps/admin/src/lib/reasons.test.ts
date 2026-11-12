import { describe, expect, it } from "vitest";
import { MAX_REASON, trimReason, validateReason } from "./reasons";

describe("reasons", () => {
  it("motivo obrigatório vazio é recusado", () => {
    expect(validateReason("", true)).toBe("Indique o motivo.");
  });

  it("motivo obrigatório só com espaços é recusado", () => {
    expect(validateReason("   ", true)).toBe("Indique o motivo.");
  });

  it("motivo opcional vazio é aceite", () => {
    expect(validateReason("", false)).toBeNull();
  });

  it("aceita até 300 caracteres e recusa mais", () => {
    expect(validateReason("x".repeat(MAX_REASON), true)).toBeNull();
    expect(validateReason("x".repeat(MAX_REASON + 1), true)).toBe(
      "O motivo pode ter no máximo 300 caracteres.",
    );
  });

  it("trimReason apara espaços e devolve undefined quando fica vazio", () => {
    expect(trimReason("  foto ilegível ")).toBe("foto ilegível");
    expect(trimReason("   ")).toBeUndefined();
    expect(trimReason("")).toBeUndefined();
  });
});
