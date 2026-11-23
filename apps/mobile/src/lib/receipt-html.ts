import { formatMoney } from "./money";
import { receiptLines, receiptTitle, type ReceiptView } from "./receipt";

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Cores da marca: verde #16A765, preto #101820, branco #FFFFFF. O verde só fica em linhas e detalhes,
// nunca por baixo de texto pequeno, por causa do contraste.
const STYLE = `
  body { font-family: Helvetica, Arial, sans-serif; color: #101820; margin: 0; padding: 32px; }
  .brand { font-size: 14px; font-weight: bold; letter-spacing: 2px; border-bottom: 4px solid #16A765; padding-bottom: 8px; }
  h1 { font-size: 22px; margin: 24px 0 4px; }
  .amount { font-size: 34px; font-weight: bold; margin: 0 0 24px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-weight: normal; color: #4B5563; padding: 10px 0; width: 45%; border-bottom: 1px solid #E5E7EB; }
  td { font-weight: bold; padding: 10px 0; border-bottom: 1px solid #E5E7EB; }
  .note { margin-top: 28px; font-size: 12px; color: #4B5563; line-height: 1.5; }
`;

export function receiptHtml(receipt: ReceiptView): string {
  const rows = receiptLines(receipt)
    .map((line) => `<tr><th>${escapeHtml(line.label)}</th><td>${escapeHtml(line.value)}</td></tr>`)
    .join("");
  const shown = receipt.direction === "out" ? receipt.total : receipt.amount;

  return [
    "<!DOCTYPE html>",
    '<html lang="pt">',
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(`Recibo ${receipt.receiptNumber}`)}</title>`,
    `<style>${STYLE}</style></head>`,
    "<body>",
    '<div class="brand">NODJUNTA-PAY</div>',
    `<h1>${escapeHtml(receiptTitle(receipt.kind, receipt.direction))}</h1>`,
    `<p class="amount">${escapeHtml(formatMoney(shown, receipt.currency))}</p>`,
    `<table>${rows}</table>`,
    '<p class="note">Comprovativo de operação registada na NODJUNTA-PAY. O número de telemóvel da outra pessoa aparece parcialmente escondido, por privacidade.</p>',
    "</body></html>",
  ].join("");
}
