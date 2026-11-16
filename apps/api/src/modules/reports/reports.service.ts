import type { SupabaseClient } from "@supabase/supabase-js";
import { toCsv } from "../../lib/csv.js";
import type { AuditService } from "../audit/audit.types.js";
import {
  ReportError,
  type DailyReport,
  type DailyReportRow,
  type DailyTotals,
  type MerchantReportRow,
  type ReportService,
  type ReportSummary,
} from "./reports.types.js";

type Row = Record<string, unknown>;

const CSV_HEADERS = [
  "Dia",
  "Transferências (n.º)",
  "Transferências (valor)",
  "Pagamentos a comerciantes (n.º)",
  "Pagamentos a comerciantes (valor)",
  "Depósitos concluídos (n.º)",
  "Depósitos concluídos (valor)",
  "Levantamentos concluídos (n.º)",
  "Levantamentos concluídos (valor)",
  "Tarifas líquidas",
  "Utilizadores novos",
] as const;

function rows(data: unknown): Row[] {
  if (Array.isArray(data)) {
    return data as Row[];
  }
  return data ? [data as Row] : [];
}

function num(value: unknown): number {
  return Number(value ?? 0);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function mapRpcError(error: { code?: string; message: string }): Error {
  if (error.code === "NJ001") {
    return new ReportError("invalid_range", 400, "Intervalo de datas inválido.");
  }
  return new Error(`Falha ao gerar o relatório: ${error.message}`);
}

function toDailyRow(row: Row): DailyReportRow {
  return {
    day: text(row.day),
    transfersCount: num(row.transfers_count),
    transfersVolume: num(row.transfers_volume),
    paymentsCount: num(row.payments_count),
    paymentsVolume: num(row.payments_volume),
    depositsCount: num(row.deposits_count),
    depositsVolume: num(row.deposits_volume),
    withdrawalsCount: num(row.withdrawals_count),
    withdrawalsVolume: num(row.withdrawals_volume),
    feesNet: num(row.fees_net),
    newUsers: num(row.new_users),
  };
}

function sumTotals(items: readonly DailyReportRow[]): DailyTotals {
  const totals: DailyTotals = {
    transfersCount: 0,
    transfersVolume: 0,
    paymentsCount: 0,
    paymentsVolume: 0,
    depositsCount: 0,
    depositsVolume: 0,
    withdrawalsCount: 0,
    withdrawalsVolume: 0,
    feesNet: 0,
    newUsers: 0,
  };
  for (const item of items) {
    totals.transfersCount += item.transfersCount;
    totals.transfersVolume += item.transfersVolume;
    totals.paymentsCount += item.paymentsCount;
    totals.paymentsVolume += item.paymentsVolume;
    totals.depositsCount += item.depositsCount;
    totals.depositsVolume += item.depositsVolume;
    totals.withdrawalsCount += item.withdrawalsCount;
    totals.withdrawalsVolume += item.withdrawalsVolume;
    totals.feesNet += item.feesNet;
    totals.newUsers += item.newUsers;
  }
  return totals;
}

export function createReportService(
  client: SupabaseClient,
  audit: AuditService,
  currency: string,
): ReportService {
  async function summary(): Promise<ReportSummary> {
    const { data, error } = await client.rpc("admin_report_summary", { p_currency: currency });
    if (error) {
      throw mapRpcError(error);
    }
    const row = rows(data)[0] ?? {};
    return {
      currency,
      userWallets: num(row.user_wallets),
      userBalance: num(row.user_balance),
      merchantWallets: num(row.merchant_wallets),
      merchantBalance: num(row.merchant_balance),
      feeBalance: num(row.fee_balance),
      settlementBalance: num(row.settlement_balance),
      suspenseBalance: num(row.suspense_balance),
      pendingDepositsCount: num(row.pending_deposits_count),
      pendingDepositsAmount: num(row.pending_deposits_amount),
      pendingWithdrawalsCount: num(row.pending_withdrawals_count),
      pendingWithdrawalsAmount: num(row.pending_withdrawals_amount),
      ledgerGap: num(row.ledger_gap),
    };
  }

  async function daily(from: string, to: string): Promise<DailyReport> {
    const { data, error } = await client.rpc("admin_report_daily", {
      p_from: from,
      p_to: to,
      p_currency: currency,
    });
    if (error) {
      throw mapRpcError(error);
    }
    const items = rows(data).map(toDailyRow);
    return { currency, from, to, rows: items, totals: sumTotals(items) };
  }

  async function merchants(from: string, to: string, limit: number): Promise<MerchantReportRow[]> {
    const { data, error } = await client.rpc("admin_report_merchants", {
      p_from: from,
      p_to: to,
      p_currency: currency,
      p_limit: limit,
    });
    if (error) {
      throw mapRpcError(error);
    }
    return rows(data).map((row) => ({
      merchantCode: text(row.merchant_code),
      businessName: text(row.business_name),
      paymentsCount: num(row.payments_count),
      paymentsVolume: num(row.payments_volume),
    }));
  }

  async function exportDailyCsv(
    adminId: string,
    from: string,
    to: string,
    ip: string | null,
  ): Promise<string> {
    // A exportação é auditada ANTES de o ficheiro ser gerado. Se a auditoria falhar, não há ficheiro.
    await audit.record({
      actorId: adminId,
      actorType: "admin",
      action: "ADMIN_REPORT_EXPORT",
      entityType: "report",
      entityId: "daily",
      ip,
      metadata: { from, to },
    });

    const report = await daily(from, to);
    const lines = report.rows.map((row) => [
      row.day,
      row.transfersCount,
      row.transfersVolume,
      row.paymentsCount,
      row.paymentsVolume,
      row.depositsCount,
      row.depositsVolume,
      row.withdrawalsCount,
      row.withdrawalsVolume,
      row.feesNet,
      row.newUsers,
    ]);
    const totals = report.totals;
    lines.push([
      "Total",
      totals.transfersCount,
      totals.transfersVolume,
      totals.paymentsCount,
      totals.paymentsVolume,
      totals.depositsCount,
      totals.depositsVolume,
      totals.withdrawalsCount,
      totals.withdrawalsVolume,
      totals.feesNet,
      totals.newUsers,
    ]);
    return toCsv(CSV_HEADERS, lines, { bom: true });
  }

  return { summary, daily, merchants, exportDailyCsv };
}
