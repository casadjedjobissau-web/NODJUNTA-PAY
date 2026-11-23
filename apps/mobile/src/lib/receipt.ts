import { formatMoney } from "./money";
import { formatDateTime } from "./statement";

export const RECEIPT_KINDS = ["transfer", "merchant_payment", "deposit", "withdrawal", "reversal"] as const;

export type ReceiptKind = (typeof RECEIPT_KINDS)[number];
export type ReceiptDirection = "in" | "out";

export interface ReceiptView {
  receiptNumber: string;
  transactionId: string;
  kind: ReceiptKind;
  direction: ReceiptDirection;
  amount: number;
  fee: number;
  total: number;
  currency: string;
  counterparty: { label: string | null; detail: string | null };
  reference: string | null;
  occurredAt: string;
  issuedAt: string;
}

export interface ReceiptLine {
  label: string;
  value: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isReceiptKind(value: unknown): value is ReceiptKind {
  return RECEIPT_KINDS.some((kind) => kind === value);
}

// Devolve o identificador da transação se o movimento tiver recibo. Tarifas e ajustes não têm.
export function receiptTarget(entry: { type: string | null; transactionId?: unknown }): string | null {
  if (!isReceiptKind(entry.type)) {
    return null;
  }
  return isUuid(entry.transactionId) ? entry.transactionId : null;
}

export function receiptTitle(kind: ReceiptKind, direction: ReceiptDirection): string {
  switch (kind) {
    case "transfer":
      return direction === "in" ? "Transferência recebida" : "Transferência enviada";
    case "merchant_payment":
      return direction === "in" ? "Pagamento recebido" : "Pagamento a comerciante";
    case "deposit":
      return "Depósito";
    case "withdrawal":
      return "Levantamento";
    case "reversal":
      return "Devolução";
  }
}

function joinParts(label: string | null, detail: string | null): string | null {
  if (label && detail) {
    return `${label} (${detail})`;
  }
  return label ?? detail;
}

function counterpartyLine(receipt: ReceiptView): ReceiptLine | null {
  const { label, detail } = receipt.counterparty;
  const out = receipt.direction === "out";

  switch (receipt.kind) {
    case "transfer": {
      const value = joinParts(label, detail);
      return value ? { label: out ? "Para" : "De", value } : null;
    }
    case "merchant_payment": {
      const value = joinParts(label, detail);
      return value ? { label: out ? "Comerciante" : "Cliente", value } : null;
    }
    case "deposit":
      return detail ? { label: "Provedor", value: detail } : null;
    case "withdrawal":
      return detail ? { label: "Destino", value: detail } : null;
    case "reversal":
      return null;
  }
}

export function receiptLines(receipt: ReceiptView): ReceiptLine[] {
  const lines: ReceiptLine[] = [
    { label: "Recibo n.º", value: receipt.receiptNumber },
    { label: "Data", value: formatDateTime(receipt.occurredAt) || "—" },
    { label: "Operação", value: receiptTitle(receipt.kind, receipt.direction) },
  ];

  const counterparty = counterpartyLine(receipt);
  if (counterparty) {
    lines.push(counterparty);
  }

  lines.push({ label: "Valor", value: formatMoney(receipt.amount, receipt.currency) });
  if (receipt.direction === "out" && receipt.fee > 0) {
    lines.push({ label: "Tarifa", value: formatMoney(receipt.fee, receipt.currency) });
    lines.push({ label: "Total debitado", value: formatMoney(receipt.total, receipt.currency) });
  }

  if (receipt.reference && receipt.reference.trim().length > 0) {
    lines.push({ label: "Referência", value: receipt.reference });
  }
  lines.push({ label: "Referência da operação", value: receipt.transactionId.slice(0, 8).toUpperCase() });

  return lines;
}
