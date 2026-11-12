const NBSP = "\u00A0";

// XOF não tem subunidade: todos os valores são inteiros em francos.
export function formatAmount(value: number): string {
  const sign = value < 0 ? "-" : "";
  const digits = String(Math.trunc(Math.abs(value)));
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

export function formatMoney(value: number, currency = "XOF"): string {
  return `${formatAmount(value)}${NBSP}${currency}`;
}

export const MAX_AMOUNT = 1_000_000_000;

// Aceita apenas dígitos (espaços são ignorados). Devolve null se for inválido, zero ou grande demais.
export function parseAmountInput(text: string, max: number = MAX_AMOUNT): number | null {
  const compact = text.replace(/[\s\u00A0]/g, "");
  if (!/^[0-9]+$/.test(compact)) {
    return null;
  }
  const value = Number(compact);
  if (!Number.isSafeInteger(value) || value <= 0 || value > max) {
    return null;
  }
  return value;
}
