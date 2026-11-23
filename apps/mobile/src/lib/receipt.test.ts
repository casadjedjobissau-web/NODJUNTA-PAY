import { describe, expect, it } from "vitest";
import { formatMoney } from "./money";
import { isUuid, receiptLines, receiptTarget, receiptTitle, type ReceiptView } from "./receipt";

const TX = "33333333-3333-4333-8333-333333333333";
const WHEN = new Date(2026, 10, 14, 10, 30, 0).toISOString();

function receipt(overrides: Partial<ReceiptView> = {}): ReceiptView {
  return {
    receiptNumber: "NP-261114-000123",
    transactionId: TX,
    kind: "transfer",
    direction: "out",
    amount: 4000,
    fee: 100,
    total: 4100,
    currency: "XOF",
    counterparty: { label: "Bruno Sá", detail: "+245 955 *** 302" },
    reference: "almoço",
    occurredAt: WHEN,
    issuedAt: WHEN,
    ...overrides,
  };
}

function labels(view: ReceiptView): string[] {
  return receiptLines(view).map((line) => line.label);
}

describe("isUuid", () => {
  it("aceita UUIDs e rejeita o resto", () => {
    expect(isUuid(TX)).toBe(true);
    expect(isUuid(TX.toUpperCase())).toBe(true);
    for (const value of ["", "abc", "33333333-3333-4333-8333-33333333333", 42, null, undefined]) {
      expect(isUuid(value)).toBe(false);
    }
  });
});

describe("receiptTarget", () => {
  it("devolve o identificador dos movimentos que têm recibo", () => {
    for (const type of ["transfer", "merchant_payment", "deposit", "withdrawal", "reversal"]) {
      expect(receiptTarget({ type, transactionId: TX })).toBe(TX);
    }
  });

  it("não há recibo para tarifas, ajustes, tipos desconhecidos ou sem tipo", () => {
    for (const type of ["fee", "adjustment", "algo_novo", null]) {
      expect(receiptTarget({ type, transactionId: TX })).toBeNull();
    }
  });

  it("sem identificador válido não há recibo", () => {
    expect(receiptTarget({ type: "transfer" })).toBeNull();
    expect(receiptTarget({ type: "transfer", transactionId: "x" })).toBeNull();
    expect(receiptTarget({ type: "transfer", transactionId: 7 })).toBeNull();
  });
});

describe("receiptTitle", () => {
  it("usa os mesmos títulos do extrato", () => {
    expect(receiptTitle("transfer", "out")).toBe("Transferência enviada");
    expect(receiptTitle("transfer", "in")).toBe("Transferência recebida");
    expect(receiptTitle("merchant_payment", "out")).toBe("Pagamento a comerciante");
    expect(receiptTitle("merchant_payment", "in")).toBe("Pagamento recebido");
    expect(receiptTitle("deposit", "in")).toBe("Depósito");
    expect(receiptTitle("withdrawal", "out")).toBe("Levantamento");
    expect(receiptTitle("reversal", "in")).toBe("Devolução");
  });
});

describe("receiptLines", () => {
  it("uma transferência enviada com tarifa mostra o total debitado", () => {
    expect(receiptLines(receipt())).toEqual([
      { label: "Recibo n.º", value: "NP-261114-000123" },
      { label: "Data", value: "14/11/2026 10:30" },
      { label: "Operação", value: "Transferência enviada" },
      { label: "Para", value: "Bruno Sá (+245 955 *** 302)" },
      { label: "Valor", value: formatMoney(4000, "XOF") },
      { label: "Tarifa", value: formatMoney(100, "XOF") },
      { label: "Total debitado", value: formatMoney(4100, "XOF") },
      { label: "Referência", value: "almoço" },
      { label: "Referência da operação", value: "33333333" },
    ]);
  });

  it("uma transferência recebida diz 'De' e não mostra tarifa nem total", () => {
    const view = receipt({ direction: "in", fee: 0, total: 4000, counterparty: { label: "Ana Gomes", detail: "+245 955 *** 301" } });

    expect(receiptLines(view).find((line) => line.label === "De")?.value).toBe("Ana Gomes (+245 955 *** 301)");
    expect(labels(view)).not.toContain("Tarifa");
    expect(labels(view)).not.toContain("Total debitado");
  });

  it("uma saída sem tarifa não mostra tarifa nem total", () => {
    const view = receipt({ fee: 0, total: 4000 });

    expect(labels(view)).not.toContain("Tarifa");
    expect(labels(view)).not.toContain("Total debitado");
  });

  it("um pagamento a comerciante mostra o nome e o código", () => {
    const view = receipt({
      kind: "merchant_payment",
      fee: 0,
      total: 1500,
      amount: 1500,
      counterparty: { label: "Loja Teste", detail: "AB12CD34" },
    });

    expect(receiptLines(view).find((line) => line.label === "Comerciante")?.value).toBe("Loja Teste (AB12CD34)");
  });

  it("o comerciante que recebe vê 'Cliente'", () => {
    const view = receipt({ kind: "merchant_payment", direction: "in", fee: 0, total: 1500, amount: 1500 });

    expect(labels(view)).toContain("Cliente");
    expect(labels(view)).not.toContain("Comerciante");
  });

  it("depósito mostra o provedor e levantamento mostra o destino", () => {
    const deposit = receipt({ kind: "deposit", direction: "in", fee: 0, counterparty: { label: "Depósito na carteira", detail: "sandbox" } });
    const withdrawal = receipt({ kind: "withdrawal", counterparty: { label: "Levantamento", detail: "+245 955 *** 099" } });

    expect(receiptLines(deposit).find((line) => line.label === "Provedor")?.value).toBe("sandbox");
    expect(receiptLines(withdrawal).find((line) => line.label === "Destino")?.value).toBe("+245 955 *** 099");
  });

  it("uma devolução não mostra a outra parte", () => {
    const view = receipt({ kind: "reversal", direction: "in", fee: 0, counterparty: { label: "Devolução", detail: null } });

    expect(labels(view)).toEqual([
      "Recibo n.º",
      "Data",
      "Operação",
      "Valor",
      "Referência",
      "Referência da operação",
    ]);
  });

  it("a referência só aparece quando existe e não é só espaços", () => {
    expect(labels(receipt({ reference: null }))).not.toContain("Referência");
    expect(labels(receipt({ reference: "   " }))).not.toContain("Referência");
    expect(labels(receipt({ reference: "almoço" }))).toContain("Referência");
  });

  it("com só o nome, ou só o detalhe, mostra o que existe", () => {
    const onlyLabel = receipt({ counterparty: { label: "Bruno Sá", detail: null } });
    const onlyDetail = receipt({ counterparty: { label: null, detail: "+245 955 *** 302" } });
    const neither = receipt({ counterparty: { label: null, detail: null } });

    expect(receiptLines(onlyLabel).find((line) => line.label === "Para")?.value).toBe("Bruno Sá");
    expect(receiptLines(onlyDetail).find((line) => line.label === "Para")?.value).toBe("+245 955 *** 302");
    expect(labels(neither)).not.toContain("Para");
  });

  it("uma data inválida mostra um traço", () => {
    expect(receiptLines(receipt({ occurredAt: "ontem" })).find((line) => line.label === "Data")?.value).toBe("—");
  });
});
