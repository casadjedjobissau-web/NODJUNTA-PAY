import { describe, expect, it } from "vitest";
import { PIN_LENGTH, isValidPinFormat, pinProblem } from "./pin-policy.js";

const FORMAT_MESSAGE = "O PIN deve ter exatamente 6 dígitos.";

describe("pin-policy", () => {
  it("isValidPinFormat aceita exatamente 6 dígitos", () => {
    expect(PIN_LENGTH).toBe(6);
    expect(isValidPinFormat("482913")).toBe(true);
    expect(isValidPinFormat("000000")).toBe(true);
  });

  it("isValidPinFormat rejeita tamanhos errados, letras, espaços e vazio", () => {
    for (const value of ["", "12345", "1234567", "12345a", "123 56", " 12345", "١٢٣٤٥٦"]) {
      expect(isValidPinFormat(value)).toBe(false);
    }
  });

  it("pinProblem aceita PINs fortes", () => {
    for (const value of ["482913", "135790", "908172", "246801", "197364"]) {
      expect(pinProblem(value)).toBeNull();
    }
  });

  it("recusa todos os dígitos iguais", () => {
    for (const value of ["000000", "111111", "999999"]) {
      expect(pinProblem(value)).toBe("O PIN não pode ter todos os dígitos iguais.");
    }
  });

  it("recusa sequências crescentes", () => {
    for (const value of ["123456", "234567", "345678", "456789"]) {
      expect(pinProblem(value)).toBe("O PIN não pode ser uma sequência de números.");
    }
  });

  it("recusa sequências decrescentes", () => {
    for (const value of ["654321", "987654", "876543", "543210"]) {
      expect(pinProblem(value)).toBe("O PIN não pode ser uma sequência de números.");
    }
  });

  it("recusa padrões repetidos", () => {
    for (const value of ["121212", "909090", "123123", "456456"]) {
      expect(pinProblem(value)).toBe("O PIN não pode ser um padrão repetido.");
    }
  });

  it("devolve a mensagem de formato para PINs inválidos", () => {
    expect(pinProblem("12345")).toBe(FORMAT_MESSAGE);
    expect(pinProblem("abcdef")).toBe(FORMAT_MESSAGE);
    expect(pinProblem("")).toBe(FORMAT_MESSAGE);
  });
});
