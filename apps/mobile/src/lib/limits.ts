import { formatMoney } from "./money";
import type { FeeView, LimitOperation, PeriodUsage } from "./types";

export function operationLabel(operation: LimitOperation): string {
  switch (operation) {
    case "transfer":
      return "Transferências";
    case "merchant_payment":
      return "Pagamentos a comerciantes";
    case "withdrawal":
      return "Levantamentos";
  }
}

// 100 pontos-base = 1%.
export function formatPercent(bps: number): string {
  const percent = bps / 100;
  if (Number.isInteger(percent)) {
    return `${percent}%`;
  }
  const text = percent.toFixed(2).replace(/0+$/, "").replace(/\.$/, "").replace(".", ",");
  return `${text}%`;
}

export function describeFee(fee: FeeView, currency = "XOF"): string {
  const parts: string[] = [];
  if (fee.flatAmount > 0) {
    parts.push(formatMoney(fee.flatAmount, currency));
  }
  if (fee.bps > 0) {
    parts.push(formatPercent(fee.bps));
  }
  if (parts.length === 0) {
    return "Sem tarifa";
  }

  let text = parts.join(" + ");
  const extras: string[] = [];
  if (fee.minFee > 0) {
    extras.push(`mínimo ${formatMoney(fee.minFee, currency)}`);
  }
  if (fee.maxFee !== null) {
    extras.push(`máximo ${formatMoney(fee.maxFee, currency)}`);
  }
  if (extras.length > 0) {
    text += ` (${extras.join(", ")})`;
  }
  return text;
}

export function describeUsage(usage: PeriodUsage, currency = "XOF"): string {
  return `${formatMoney(usage.used, currency)} de ${formatMoney(usage.limit, currency)} (restam ${formatMoney(usage.remaining, currency)})`;
}
