import { describe, expect, it } from "vitest";
import { describeFee, describeUsage, formatPercent, operationLabel } from "./limits";

const NBSP = "\u00A0";

describe("limits", () => {
  it("operationLabel dá um nome por operação", () => {
    expect(operationLabel("transfer")).toBe("Transferências");
    expect(operationLabel("merchant_payment")).toBe("Pagamentos a comerciantes");
    expect(operationLabel("withdrawal")).toBe("Levantamentos");
  });

  it("sem tarifa", () => {
    expect(describeFee({ flatAmount: 0, bps: 0, minFee: 0, maxFee: null })).toBe("Sem tarifa");
  });

  it("tarifa fixa", () => {
    expect(describeFee({ flatAmount: 100, bps: 0, minFee: 0, maxFee: null })).toBe(`100${NBSP}XOF`);
  });

  it("tarifa fixa mais percentagem", () => {
    expect(describeFee({ flatAmount: 100, bps: 100, minFee: 0, maxFee: null })).toBe(
      `100${NBSP}XOF + 1%`,
    );
  });

  it("percentagens com casas decimais usam vírgula", () => {
    expect(formatPercent(100)).toBe("1%");
    expect(formatPercent(150)).toBe("1,5%");
    expect(formatPercent(25)).toBe("0,25%");
  });

  it("mínimo e máximo aparecem entre parênteses", () => {
    expect(describeFee({ flatAmount: 0, bps: 100, minFee: 50, maxFee: 500 })).toBe(
      `1% (mínimo 50${NBSP}XOF, máximo 500${NBSP}XOF)`,
    );
  });

  it("describeUsage mostra usado, limite e restante", () => {
    expect(describeUsage({ limit: 50000, used: 12000, remaining: 38000 })).toBe(
      `12${NBSP}000${NBSP}XOF de 50${NBSP}000${NBSP}XOF (restam 38${NBSP}000${NBSP}XOF)`,
    );
  });
});
