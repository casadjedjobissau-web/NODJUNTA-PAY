import { describe, expect, it } from "vitest";
import { PIN_KEYS, isComplete, pressDelete, pressDigit } from "./pin-entry";

describe("pin-entry", () => {
  it("pressDigit acrescenta dígitos pela ordem", () => {
    expect(pressDigit("", "4")).toBe("4");
    expect(pressDigit("4", "8")).toBe("48");
    expect(pressDigit("4829", "1")).toBe("48291");
  });

  it("ignora o que não é um único dígito", () => {
    for (const value of ["a", "12", "", "-", " "]) {
      expect(pressDigit("48", value)).toBe("48");
    }
  });

  it("ignora dígitos quando o PIN já está completo", () => {
    expect(pressDigit("482913", "7")).toBe("482913");
  });

  it("pressDelete apaga o último dígito", () => {
    expect(pressDelete("482913")).toBe("48291");
    expect(pressDelete("4")).toBe("");
  });

  it("pressDelete num PIN vazio não faz nada", () => {
    expect(pressDelete("")).toBe("");
  });

  it("isComplete só é verdadeiro com 6 dígitos", () => {
    expect(isComplete("48291")).toBe(false);
    expect(isComplete("482913")).toBe(true);
    expect(isComplete("")).toBe(false);
  });

  it("PIN_KEYS tem 12 teclas: os dígitos 0 a 9 uma vez cada, um espaço e apagar", () => {
    expect(PIN_KEYS).toHaveLength(12);
    const digits = PIN_KEYS.filter((key) => /^[0-9]$/.test(key)).sort();
    expect(digits).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    expect(PIN_KEYS.filter((key) => key === "")).toHaveLength(1);
    expect(PIN_KEYS.filter((key) => key === "delete")).toHaveLength(1);
  });

  it("digitar seis dígitos seguidos completa o PIN", () => {
    let current = "";
    for (const digit of "482913") {
      current = pressDigit(current, digit);
    }
    expect(current).toBe("482913");
    expect(isComplete(current)).toBe(true);
  });
});
