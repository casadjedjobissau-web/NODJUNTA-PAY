import { describe, expect, it } from "vitest";
import { formatMoney } from "./money";
import { escapeHtml, receiptHtml } from "./receipt-html";
import { receiptLines, type ReceiptView } from "./receipt";

const WHEN = new Date(2026, 10, 14, 10, 30, 0).toISOString();

function receipt(overrides: Partial<ReceiptView> = {}): ReceiptView {
  return {
    receiptNumber: "NP-261114-000123",
    transactionId: "33333333-3333-4333-8333-333333333333",
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

describe("escapeHtml", () => {
  it("escapa os cinco caracteres perigosos, começando pelo &", () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;",
    );
  });

  it("não altera texto normal, com acentos", () => {
    expect(escapeHtml("Loja da Maria, pão e café")).toBe("Loja da Maria, pão e café");
  });
});

describe("receiptHtml", () => {
  it("é um documento completo em português com o número e o título", () => {
    const html = receiptHtml(receipt());

    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain('<html lang="pt">');
    expect(html).toContain("<title>Recibo NP-261114-000123</title>");
    expect(html).toContain("<h1>Transferência enviada</h1>");
    expect(html).toContain("NODJUNTA-PAY");
  });

  it("inclui todas as linhas do recibo", () => {
    const view = receipt();
    const html = receiptHtml(view);

    for (const line of receiptLines(view)) {
      expect(html).toContain(`<th>${escapeHtml(line.label)}</th><td>${escapeHtml(line.value)}</td>`);
    }
  });

  it("um nome com código HTML não passa", () => {
    const html = receiptHtml(receipt({ counterparty: { label: "<script>alert(1)</script>", detail: null } }));

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("uma referência com aspas e & fica escapada", () => {
    const html = receiptHtml(receipt({ reference: `"pão" & café` }));

    expect(html).toContain("&quot;pão&quot; &amp; café");
  });

  it("o valor em destaque é o total numa saída e o valor numa entrada", () => {
    const out = receiptHtml(receipt());
    const incoming = receiptHtml(receipt({ direction: "in", fee: 0, total: 4000 }));

    expect(out).toContain(`<p class="amount">${escapeHtml(formatMoney(4100, "XOF"))}</p>`);
    expect(incoming).toContain(`<p class="amount">${escapeHtml(formatMoney(4000, "XOF"))}</p>`);
  });

  it("não escreve 'undefined' nem 'null' e avisa que o telemóvel está escondido", () => {
    const html = receiptHtml(receipt({ reference: null, counterparty: { label: null, detail: null } }));

    expect(html).not.toContain("undefined");
    expect(html).not.toContain("null");
    expect(html).toContain("parcialmente escondido");
  });
});
