import { describe, expect, it } from "vitest";
import { PIN_LENGTH, isValidPinFormat, lockedMessage, pinProblem, sanitizePin } from "./pin";

const FORMAT_MESSAGE = "O PIN deve ter exatamente 6 dígitos.";
const NOW = new Date(2026, 10, 14, 10, 0, 0);

function inMs(ms: number): string {
  return new Date(NOW.getTime() + ms).toISOString();
}

describe("sanitizePin", () => {
  it("remove tudo o que não é dígito e limita a 6", () => {
    expect(PIN_LENGTH).toBe(6);
    expect(sanitizePin("12 34-56")).toBe("123456");
    expect(sanitizePin("1234567890")).toBe("123456");
    expect(sanitizePin("abc")).toBe("");
  });

  it("não aceita dígitos de outros alfabetos", () => {
    expect(sanitizePin("١٢٣٤٥٦")).toBe("");
    expect(sanitizePin("１２３４５６")).toBe("");
  });
});

describe("isValidPinFormat", () => {
  it("aceita exatamente 6 dígitos", () => {
    expect(isValidPinFormat("482913")).toBe(true);
    expect(isValidPinFormat("000000")).toBe(true);
  });

  it("rejeita tamanhos errados, letras, espaços e vazio", () => {
    for (const value of ["", "12345", "1234567", "12345a", "123 56", " 12345", "١٢٣٤٥٦"]) {
      expect(isValidPinFormat(value)).toBe(false);
    }
  });
});

describe("pinProblem (as mesmas regras e mensagens do servidor)", () => {
  it("aceita PINs fortes", () => {
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

describe("lockedMessage", () => {
  it("sem hora pede para tentar mais tarde", () => {
    const expected = "PIN bloqueado por tentativas falhadas. Tente mais tarde.";
    expect(lockedMessage(null, NOW)).toBe(expected);
    expect(lockedMessage(undefined, NOW)).toBe(expected);
    expect(lockedMessage("", NOW)).toBe(expected);
  });

  it("com uma hora inválida também pede para tentar mais tarde", () => {
    expect(lockedMessage("ontem", NOW)).toBe("PIN bloqueado por tentativas falhadas. Tente mais tarde.");
  });

  it("quando o bloqueio já terminou, avisa", () => {
    const expected = "O bloqueio do PIN já terminou. Tente novamente.";
    expect(lockedMessage(inMs(-1000), NOW)).toBe(expected);
    expect(lockedMessage(inMs(0), NOW)).toBe(expected);
  });

  it("arredonda os minutos para cima e usa o singular", () => {
    expect(lockedMessage(inMs(14 * 60_000 + 1000), NOW)).toBe(
      "PIN bloqueado por tentativas falhadas. Tente novamente dentro de 15 minutos.",
    );
    expect(lockedMessage(inMs(30_000), NOW)).toBe(
      "PIN bloqueado por tentativas falhadas. Tente novamente dentro de 1 minuto.",
    );
    expect(lockedMessage(inMs(60_000), NOW)).toBe(
      "PIN bloqueado por tentativas falhadas. Tente novamente dentro de 1 minuto.",
    );
  });

  it("passa a horas acima de duas horas", () => {
    expect(lockedMessage(inMs(120 * 60_000), NOW)).toBe(
      "PIN bloqueado por tentativas falhadas. Tente novamente dentro de 120 minutos.",
    );
    expect(lockedMessage(inMs(121 * 60_000), NOW)).toBe(
      "PIN bloqueado por tentativas falhadas. Tente novamente dentro de 3 horas.",
    );
  });
});
