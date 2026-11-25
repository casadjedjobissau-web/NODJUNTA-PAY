import { formatAmount } from "./format";

export interface ReportSummary {
  currency: string;
  userWallets: number;
  userBalance: number;
  merchantWallets: number;
  merchantBalance: number;
  feeBalance: number;
  settlementBalance: number;
  suspenseBalance: number;
  pendingDepositsCount: number;
  pendingDepositsAmount: number;
  pendingWithdrawalsCount: number;
  pendingWithdrawalsAmount: number;
  ledgerGap: number;
}

export interface DailyTotals {
  transfersCount: number;
  transfersVolume: number;
  paymentsCount: number;
  paymentsVolume: number;
  depositsCount: number;
  depositsVolume: number;
  withdrawalsCount: number;
  withdrawalsVolume: number;
  feesNet: number;
  newUsers: number;
}

export interface DailyReportRow extends DailyTotals {
  day: string;
}

export interface DailyReport {
  currency: string;
  from: string;
  to: string;
  rows: DailyReportRow[];
  totals: DailyTotals;
}

export interface MerchantReportRow {
  merchantCode: string;
  businessName: string;
  paymentsCount: number;
  paymentsVolume: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export interface DateRange {
  from: string;
  to: string;
}

// Os dias contam em UTC, como no servidor.
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && toIsoDate(date) === value;
}

function dayNumber(value: string): number {
  return Date.parse(`${value}T00:00:00.000Z`) / DAY_MS;
}

// Os últimos 30 dias até hoje, como por omissão na API.
export function defaultRange(today: Date): DateRange {
  const to = toIsoDate(today);
  return { from: toIsoDate(new Date(Date.parse(`${to}T00:00:00.000Z`) - 29 * DAY_MS)), to };
}

// Devolve a mensagem do problema, ou null se o intervalo for aceitável. Mesmas regras da API.
export function validateRange(from: string, to: string, today: Date, maxDays = 92): string | null {
  if (!isRealDate(from) || !isRealDate(to)) {
    return "Escolha datas válidas.";
  }
  if (to > toIsoDate(today)) {
    return "A data final não pode estar no futuro.";
  }
  if (from > to) {
    return "A data inicial não pode ser posterior à final.";
  }
  if (dayNumber(to) - dayNumber(from) + 1 > maxDays) {
    return `O intervalo máximo é de ${maxDays} dias.`;
  }
  return null;
}

export interface LedgerStatus {
  ok: boolean;
  label: string;
}

// A soma de todas as contas tem de dar sempre 0 (partidas dobradas).
export function ledgerStatus(gap: number): LedgerStatus {
  if (gap === 0) {
    return { ok: true, label: "Equilibrado (0)" };
  }
  return { ok: false, label: `Diferença de ${formatAmount(gap)}. Investigue de imediato.` };
}

export function csvPath(from: string, to: string): string {
  return `/admin/v1/reports/daily.csv?from=${from}&to=${to}`;
}

// 2026-11-14 passa a 14/11/2026. Um valor inesperado fica como está.
export function formatDay(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso;
}
