import { formatMoney } from "./money";
import type { StatementEntry } from "./types";

export function entryTitle(type: string | null, direction: "debit" | "credit"): string {
  switch (type) {
    case "transfer":
      return direction === "credit" ? "Transferência recebida" : "Transferência enviada";
    case "merchant_payment":
      return direction === "credit" ? "Pagamento recebido" : "Pagamento a comerciante";
    case "deposit":
      return "Depósito";
    case "withdrawal":
      return "Levantamento";
    case "fee":
      return "Tarifa";
    case "reversal":
      return "Devolução";
    case "adjustment":
      return "Ajuste";
    default:
      return "Movimento";
  }
}

export interface EntryView {
  title: string;
  amountText: string;
  positive: boolean;
  subtitle: string | null;
}

export function describeEntry(entry: StatementEntry, currency = "XOF"): EntryView {
  const positive = entry.direction === "credit";
  return {
    title: entryTitle(entry.type, entry.direction),
    amountText: `${positive ? "+" : "-"}${formatMoney(entry.amount, currency)}`,
    positive,
    subtitle: entry.reference && entry.reference.trim().length > 0 ? entry.reference : null,
  };
}

// dd/mm/aaaa hh:mm na hora local do telemóvel.
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
