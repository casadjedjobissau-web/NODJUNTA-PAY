import { describe, expect, it } from "vitest";
import { describeEntry, entryTitle, formatDateTime } from "./statement";
import type { StatementEntry } from "./types";

const NBSP = "\u00A0";

function entry(overrides: Partial<StatementEntry> = {}): StatementEntry {
  return {
    id: 1,
    transactionId: "33333333-3333-4333-8333-333333333333",
    direction: "credit",
    amount: 4000,
    balanceAfter: 10000,
    createdAt: "2026-11-10T12:00:00.000Z",
    type: "transfer",
    reference: null,
    ...overrides,
  };
}

describe("describeEntry", () => {
  it("transferência recebida (crédito) é positiva", () => {
    expect(describeEntry(entry())).toEqual({
      title: "Transferência recebida",
      amountText: `+4${NBSP}000${NBSP}XOF`,
      positive: true,
      subtitle: null,
    });
  });

  it("transferência enviada (débito) é negativa", () => {
    const view = describeEntry(entry({ direction: "debit" }));
    expect(view.title).toBe("Transferência enviada");
    expect(view.amountText).toBe(`-4${NBSP}000${NBSP}XOF`);
    expect(view.positive).toBe(false);
  });

  it("usa um título por tipo de movimento", () => {
    expect(entryTitle("merchant_payment", "debit")).toBe("Pagamento a comerciante");
    expect(entryTitle("merchant_payment", "credit")).toBe("Pagamento recebido");
    expect(entryTitle("deposit", "credit")).toBe("Depósito");
    expect(entryTitle("withdrawal", "debit")).toBe("Levantamento");
    expect(entryTitle("fee", "debit")).toBe("Tarifa");
    expect(entryTitle("reversal", "credit")).toBe("Devolução");
    expect(entryTitle("adjustment", "credit")).toBe("Ajuste");
  });

  it("tipo desconhecido ou nulo vira 'Movimento'", () => {
    expect(entryTitle(null, "debit")).toBe("Movimento");
    expect(entryTitle("algo_novo", "credit")).toBe("Movimento");
  });

  it("a referência vira subtítulo, mas só se não estiver vazia", () => {
    expect(describeEntry(entry({ reference: "almoço" })).subtitle).toBe("almoço");
    expect(describeEntry(entry({ reference: "   " })).subtitle).toBeNull();
  });
});

describe("formatDateTime", () => {
  it("formata em dd/mm/aaaa hh:mm (hora local)", () => {
    const iso = new Date(2026, 10, 12, 9, 5).toISOString();
    expect(formatDateTime(iso)).toBe("12/11/2026 09:05");
  });

  it("devolve texto vazio para datas inválidas", () => {
    expect(formatDateTime("isto não é uma data")).toBe("");
  });
});
