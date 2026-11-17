import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { AuditEntry, AuditService } from "../audit/audit.types.js";
import { createReportService } from "./reports.service.js";

type RpcResult = { data: unknown; error: { code?: string; message: string } | null };
type Handler = (params: Record<string, unknown>) => RpcResult;

interface RpcCall {
  fn: string;
  params: Record<string, unknown>;
}

const ADMIN = "aaaaaaaa-0000-4000-8000-00000000000a";

function setup(handlers: Record<string, Handler>, failAudit = false) {
  const events: string[] = [];
  const rpcCalls: RpcCall[] = [];
  const entries: AuditEntry[] = [];

  const client = {
    rpc: async (fn: string, params: Record<string, unknown>) => {
      events.push(`rpc:${fn}`);
      rpcCalls.push({ fn, params });
      const handler = handlers[fn];
      if (!handler) {
        throw new Error(`rpc inesperado: ${fn}`);
      }
      return handler(params);
    },
  } as unknown as SupabaseClient;

  const audit: AuditService = {
    record: async (entry) => {
      events.push(`audit:${entry.action}`);
      if (failAudit) {
        throw new Error("auditoria indisponível");
      }
      entries.push(entry);
    },
  };

  return { service: createReportService(client, audit, "XOF"), events, entries, rpcCalls };
}

const SUMMARY_ROW = {
  user_wallets: 12,
  user_balance: 480000,
  merchant_wallets: 3,
  merchant_balance: 90000,
  fee_balance: 1200,
  settlement_balance: -571700,
  suspense_balance: 500,
  pending_deposits_count: 1,
  pending_deposits_amount: 3000,
  pending_withdrawals_count: 1,
  pending_withdrawals_amount: 500,
  ledger_gap: 0,
};

function dailyRow(day: string, overrides: Record<string, unknown> = {}) {
  return {
    day,
    transfers_count: 2,
    transfers_volume: 7000,
    payments_count: 1,
    payments_volume: 1500,
    deposits_count: 1,
    deposits_volume: 8000,
    withdrawals_count: 1,
    withdrawals_volume: 2000,
    fees_net: 300,
    new_users: 3,
    ...overrides,
  };
}

const ok = (data: unknown): Handler => () => ({ data, error: null });

const CSV_HEADER =
  "Dia,Transferências (n.º),Transferências (valor),Pagamentos a comerciantes (n.º)," +
  "Pagamentos a comerciantes (valor),Depósitos concluídos (n.º),Depósitos concluídos (valor)," +
  "Levantamentos concluídos (n.º),Levantamentos concluídos (valor),Tarifas líquidas,Utilizadores novos";

describe("createReportService: resumo", () => {
  it("converte a linha num resumo, com a moeda configurada", async () => {
    const { service } = setup({ admin_report_summary: ok([SUMMARY_ROW]) });

    expect(await service.summary()).toEqual({
      currency: "XOF",
      userWallets: 12,
      userBalance: 480000,
      merchantWallets: 3,
      merchantBalance: 90000,
      feeBalance: 1200,
      settlementBalance: -571700,
      suspenseBalance: 500,
      pendingDepositsCount: 1,
      pendingDepositsAmount: 3000,
      pendingWithdrawalsCount: 1,
      pendingWithdrawalsAmount: 500,
      ledgerGap: 0,
    });
  });

  it("envia a moeda à função SQL", async () => {
    const { service, rpcCalls } = setup({ admin_report_summary: ok([SUMMARY_ROW]) });

    await service.summary();

    expect(rpcCalls).toEqual([{ fn: "admin_report_summary", params: { p_currency: "XOF" } }]);
  });

  it("sem linha na resposta, tudo fica a zero", async () => {
    const { service } = setup({ admin_report_summary: ok([]) });

    const summary = await service.summary();

    expect(summary.userBalance).toBe(0);
    expect(summary.ledgerGap).toBe(0);
    expect(summary.currency).toBe("XOF");
  });

  it("erros inesperados sobem como erros genéricos", async () => {
    const { service } = setup({
      admin_report_summary: () => ({ data: null, error: { code: "XX000", message: "base de dados em baixo" } }),
    });

    await expect(service.summary()).rejects.toThrow("Falha ao gerar o relatório");
  });
});

describe("createReportService: relatório diário", () => {
  it("converte as linhas, soma os totais e envia o intervalo e a moeda", async () => {
    const { service, rpcCalls } = setup({
      admin_report_daily: ok([
        dailyRow("2026-11-13"),
        dailyRow("2026-11-14", { transfers_count: 5, fees_net: 100, new_users: 0 }),
      ]),
    });

    const report = await service.daily("2026-11-13", "2026-11-14");

    expect(rpcCalls).toEqual([
      { fn: "admin_report_daily", params: { p_from: "2026-11-13", p_to: "2026-11-14", p_currency: "XOF" } },
    ]);
    expect(report.currency).toBe("XOF");
    expect(report.from).toBe("2026-11-13");
    expect(report.to).toBe("2026-11-14");
    expect(report.rows).toHaveLength(2);
    expect(report.rows[0]).toEqual({
      day: "2026-11-13",
      transfersCount: 2,
      transfersVolume: 7000,
      paymentsCount: 1,
      paymentsVolume: 1500,
      depositsCount: 1,
      depositsVolume: 8000,
      withdrawalsCount: 1,
      withdrawalsVolume: 2000,
      feesNet: 300,
      newUsers: 3,
    });
    expect(report.totals).toEqual({
      transfersCount: 7,
      transfersVolume: 14000,
      paymentsCount: 2,
      paymentsVolume: 3000,
      depositsCount: 2,
      depositsVolume: 16000,
      withdrawalsCount: 2,
      withdrawalsVolume: 4000,
      feesNet: 400,
      newUsers: 3,
    });
  });

  it("aceita números que chegam como texto", async () => {
    const { service } = setup({
      admin_report_daily: ok([dailyRow("2026-11-14", { transfers_volume: "7000", fees_net: "300" })]),
    });

    const report = await service.daily("2026-11-14", "2026-11-14");

    expect(report.rows[0]?.transfersVolume).toBe(7000);
    expect(report.totals.feesNet).toBe(300);
  });

  it("sem dias, devolve zero linhas e totais a zero", async () => {
    const { service } = setup({ admin_report_daily: ok([]) });

    const report = await service.daily("2026-11-14", "2026-11-14");

    expect(report.rows).toEqual([]);
    expect(report.totals.transfersCount).toBe(0);
    expect(report.totals.feesNet).toBe(0);
  });

  it("NJ001 vira invalid_range (400)", async () => {
    const { service } = setup({
      admin_report_daily: () => ({ data: null, error: { code: "NJ001", message: "x" } }),
    });

    await expect(service.daily("2026-11-14", "2026-11-14")).rejects.toMatchObject({
      code: "invalid_range",
      httpStatus: 400,
    });
  });
});

describe("createReportService: comerciantes", () => {
  it("converte as linhas e envia o intervalo, a moeda e o limite", async () => {
    const { service, rpcCalls } = setup({
      admin_report_merchants: ok([
        { merchant_code: "AB12CD34", business_name: "Loja Teste", payments_count: 4, payments_volume: "9500" },
      ]),
    });

    const items = await service.merchants("2026-11-01", "2026-11-14", 5);

    expect(items).toEqual([
      { merchantCode: "AB12CD34", businessName: "Loja Teste", paymentsCount: 4, paymentsVolume: 9500 },
    ]);
    expect(rpcCalls).toEqual([
      {
        fn: "admin_report_merchants",
        params: { p_from: "2026-11-01", p_to: "2026-11-14", p_currency: "XOF", p_limit: 5 },
      },
    ]);
  });

  it("NJ001 vira invalid_range (400)", async () => {
    const { service } = setup({
      admin_report_merchants: () => ({ data: null, error: { code: "NJ001", message: "x" } }),
    });

    await expect(service.merchants("2026-11-01", "2026-11-14", 5)).rejects.toMatchObject({
      code: "invalid_range",
      httpStatus: 400,
    });
  });
});

describe("createReportService: exportação em CSV", () => {
  it("audita ANTES de ler os dados", async () => {
    const { service, events } = setup({ admin_report_daily: ok([dailyRow("2026-11-14")]) });

    await service.exportDailyCsv(ADMIN, "2026-11-14", "2026-11-14", "10.0.0.1");

    const auditIndex = events.indexOf("audit:ADMIN_REPORT_EXPORT");
    const rpcIndex = events.indexOf("rpc:admin_report_daily");
    expect(auditIndex).toBeGreaterThanOrEqual(0);
    expect(rpcIndex).toBeGreaterThan(auditIndex);
  });

  it("regista quem exportou, de onde e que intervalo", async () => {
    const { service, entries } = setup({ admin_report_daily: ok([dailyRow("2026-11-14")]) });

    await service.exportDailyCsv(ADMIN, "2026-11-01", "2026-11-14", "10.0.0.1");

    expect(entries).toEqual([
      {
        actorId: ADMIN,
        actorType: "admin",
        action: "ADMIN_REPORT_EXPORT",
        entityType: "report",
        entityId: "daily",
        ip: "10.0.0.1",
        metadata: { from: "2026-11-01", to: "2026-11-14" },
      },
    ]);
  });

  it("gera o CSV exato: BOM, cabeçalho, uma linha por dia e a linha de total", async () => {
    const { service } = setup({ admin_report_daily: ok([dailyRow("2026-11-14")]) });

    const csv = await service.exportDailyCsv(ADMIN, "2026-11-14", "2026-11-14", null);

    expect(csv).toBe(
      "\uFEFF" +
        `${CSV_HEADER}\r\n` +
        "2026-11-14,2,7000,1,1500,1,8000,1,2000,300,3\r\n" +
        "Total,2,7000,1,1500,1,8000,1,2000,300,3\r\n",
    );
  });

  it("a linha de total soma todos os dias", async () => {
    const { service } = setup({
      admin_report_daily: ok([dailyRow("2026-11-13"), dailyRow("2026-11-14", { transfers_count: 5, fees_net: 100 })]),
    });

    const csv = await service.exportDailyCsv(ADMIN, "2026-11-13", "2026-11-14", null);
    const lines = csv.split("\r\n");

    expect(lines).toHaveLength(5);
    expect(lines[1]).toBe("2026-11-13,2,7000,1,1500,1,8000,1,2000,300,3");
    expect(lines[2]).toBe("2026-11-14,5,7000,1,1500,1,8000,1,2000,100,3");
    expect(lines[3]).toBe("Total,7,14000,2,3000,2,16000,2,4000,400,6");
    expect(lines[4]).toBe("");
  });

  it("se a auditoria falhar, não lê dados nem gera ficheiro", async () => {
    const { service, events } = setup({ admin_report_daily: ok([dailyRow("2026-11-14")]) }, true);

    await expect(service.exportDailyCsv(ADMIN, "2026-11-14", "2026-11-14", null)).rejects.toThrow(
      "auditoria indisponível",
    );
    expect(events).not.toContain("rpc:admin_report_daily");
  });
});
