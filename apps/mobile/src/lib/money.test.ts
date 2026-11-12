import { describe, expect, it } from "vitest";
import { MAX_AMOUNT, formatAmount, formatMoney, parseAmountInput } from "./money";

const NBSP = "\u00A0";

describe("formatAmount / formatMoney", () => {
  it("agrupa milhares com espaço não separável", () => {
    expect(formatAmount(0)).toBe("0");
    expect(formatAmount(999)).toBe("999");
    expect(formatAmount(1000)).toBe(`1${NBSP}000`);
    expect(formatAmount(1234567)).toBe(`1${NBSP}234${NBSP}567`);
  });

  it("formata valores negativos", () => {
    expect(formatAmount(-4000)).toBe(`-4${NBSP}000`);
  });

  it("acrescenta a moeda", () => {
    expect(formatMoney(5000)).toBe(`5${NBSP}000${NBSP}XOF`);
  });
});

describe("parseAmountInput", () => {
  it("aceita dígitos e ignora espaços", () => {
    expect(parseAmountInput("2500")).toBe(2500);
    expect(parseAmountInput(" 2 500 ")).toBe(2500);
    expect(parseAmountInput(`2${NBSP}500`)).toBe(2500);
  });

  it("rejeita vazio, zero, negativos e decimais", () => {
    expect(parseAmountInput("")).toBeNull();
    expect(parseAmountInput("0")).toBeNull();
    expect(parseAmountInput("-100")).toBeNull();
    expect(parseAmountInput("10.5")).toBeNull();
    expect(parseAmountInput("10,5")).toBeNull();
    expect(parseAmountInput("abc")).toBeNull();
  });

  it("respeita o máximo", () => {
    expect(parseAmountInput(String(MAX_AMOUNT))).toBe(MAX_AMOUNT);
    expect(parseAmountInput(String(MAX_AMOUNT + 1))).toBeNull();
    expect(parseAmountInput("500", 400)).toBeNull();
  });
});
