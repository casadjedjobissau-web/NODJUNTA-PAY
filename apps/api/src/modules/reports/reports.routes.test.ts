import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { loadEnv } from "../../config/env.js";
import { ADMIN_IDS, ADMIN_TOKENS, adminAuthenticator, makeFakeAdmin } from "../../testing/admin-fakes.js";
import { TEST_ENV, makeFakeDeps } from "../../testing/fakes.js";
import {
  ReportError,
  type DailyTotals,
  type MerchantReportRow,
  type ReportService,
  type ReportSummary,
} from "./reports.types.js";

const env = loadEnv(TEST_ENV);
const NOW = new Date("2026-11-14T15:30:00.000Z");

const ZERO: DailyTotals = {
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

const SUMMARY: ReportSummary = {
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
};

const MERCHANTS: MerchantReportRow[] = [
  { merchantCode: "AB12CD34", businessName: "Loja Teste", paymentsCount: 4, paymentsVolume: 9500 },
];

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

let app: Awaited<ReturnType<typeof buildApp>>;
let appWithout: Awaited<ReturnType<typeof buildApp>>;
let failure: Error | null = null;
let dailyCalls: Array<{ from: string; to: string }> = [];
let merchantCalls: Array<{ from: string; to: string; limit: number }> = [];
let exportCalls: Array<{ adminId: string; from: string; to: string; ip: string | null }> = [];

const service: ReportService = {
  summary: async () => SUMMARY,
  daily: async (from, to) => {
    dailyCalls.push({ from, to });
    if (failure) {
      throw failure;
    }
    return { currency: "XOF", from, to, rows: [], totals: ZERO };
  },
  merchants: async (from, to, limit) => {
    merchantCalls.push({ from, to, limit });
    return MERCHANTS;
  },
  exportDailyCsv: async (adminId, from, to, ip) => {
    exportCalls.push({ adminId, from, to, ip });
    return "\uFEFFDia\r\nTotal\r\n";
  },
};

beforeAll(async () => {
  app = await buildApp(
    env,
    makeFakeDeps({
      authenticator: adminAuthenticator(),
      admin: makeFakeAdmin(),
      reports: service,
      reportNow: () => NOW,
    }),
  );
  appWithout = await buildApp(
    env,
    makeFakeDeps({ authenticator: adminAuthenticator(), admin: makeFakeAdmin() }),
  );
});
afterAll(async () => {
  await app.close();
  await appWithout.close();
});
beforeEach(() => {
  failure = null;
  dailyCalls = [];
  merchantCalls = [];
  exportCalls = [];
});

describe("acesso aos relatórios", () => {
  it("401 sem token", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/v1/reports/summary" });
    expect(res.statusCode).toBe(401);
  });

  it("403 para um utilizador que não é administrador", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/reports/summary",
      headers: bearer(ADMIN_TOKENS.user),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("forbidden");
  });

  it("403 para o papel support", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/reports/summary",
      headers: bearer(ADMIN_TOKENS.support),
    });
    expect(res.statusCode).toBe(403);
  });

  it("403 para o papel reviewer", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/reports/daily",
      headers: bearer(ADMIN_TOKENS.reviewer),
    });
    expect(res.statusCode).toBe(403);
    expect(dailyCalls).toHaveLength(0);
  });
});

describe("GET /admin/v1/reports/summary", () => {
  it("200 devolve o resumo ao administrador", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/reports/summary",
      headers: bearer(ADMIN_TOKENS.admin),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(SUMMARY);
  });
});

describe("GET /admin/v1/reports/daily", () => {
  it("sem datas usa os últimos 30 dias até hoje", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/reports/daily",
      headers: bearer(ADMIN_TOKENS.admin),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().from).toBe("2026-10-16");
    expect(res.json().to).toBe("2026-11-14");
    expect(dailyCalls).toEqual([{ from: "2026-10-16", to: "2026-11-14" }]);
  });

  it("repassa o intervalo pedido ao serviço", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/reports/daily?from=2026-11-01&to=2026-11-10",
      headers: bearer(ADMIN_TOKENS.admin),
    });
    expect(res.statusCode).toBe(200);
    expect(dailyCalls).toEqual([{ from: "2026-11-01", to: "2026-11-10" }]);
  });

  it("400 com um formato de data inválido", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/reports/daily?from=01/11/2026",
      headers: bearer(ADMIN_TOKENS.admin),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_query");
    expect(dailyCalls).toHaveLength(0);
  });

  it("400 com uma data final no futuro", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/reports/daily?to=2026-11-15",
      headers: bearer(ADMIN_TOKENS.admin),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("futuro");
    expect(dailyCalls).toHaveLength(0);
  });

  it("400 com um intervalo de mais de 92 dias", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/reports/daily?from=2026-01-01&to=2026-11-14",
      headers: bearer(ADMIN_TOKENS.admin),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("92");
  });

  it("400 com a data inicial depois da final", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/reports/daily?from=2026-11-10&to=2026-11-05",
      headers: bearer(ADMIN_TOKENS.admin),
    });
    expect(res.statusCode).toBe(400);
    expect(dailyCalls).toHaveLength(0);
  });

  it("um erro de intervalo vindo do serviço vira uma resposta HTTP", async () => {
    failure = new ReportError("invalid_range", 400, "Intervalo de datas inválido.");
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/reports/daily?from=2026-11-01&to=2026-11-10",
      headers: bearer(ADMIN_TOKENS.admin),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_range");
  });
});

describe("GET /admin/v1/reports/daily.csv", () => {
  it("200 devolve o ficheiro e o serviço recebe o administrador, o intervalo e o IP", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/reports/daily.csv?from=2026-11-01&to=2026-11-10",
      headers: bearer(ADMIN_TOKENS.admin),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toBe(
      'attachment; filename="relatorio-diario-2026-11-01_2026-11-10.csv"',
    );
    expect(res.body).toBe("\uFEFFDia\r\nTotal\r\n");
    expect(exportCalls).toEqual([
      { adminId: ADMIN_IDS.admin, from: "2026-11-01", to: "2026-11-10", ip: "127.0.0.1" },
    ]);
  });

  it("o ficheiro não fica em cache", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/reports/daily.csv",
      headers: bearer(ADMIN_TOKENS.admin),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(exportCalls[0]).toMatchObject({ from: "2026-10-16", to: "2026-11-14" });
  });

  it("403 para o papel reviewer, sem exportar nada", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/reports/daily.csv",
      headers: bearer(ADMIN_TOKENS.reviewer),
    });
    expect(res.statusCode).toBe(403);
    expect(exportCalls).toHaveLength(0);
  });

  it("400 com datas inválidas, sem exportar nada", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/reports/daily.csv?to=amanha",
      headers: bearer(ADMIN_TOKENS.admin),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_query");
    expect(exportCalls).toHaveLength(0);
  });
});

describe("GET /admin/v1/reports/merchants", () => {
  it("200 usa o intervalo por omissão e 10 comerciantes", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/reports/merchants",
      headers: bearer(ADMIN_TOKENS.admin),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ items: MERCHANTS });
    expect(merchantCalls).toEqual([{ from: "2026-10-16", to: "2026-11-14", limit: 10 }]);
  });

  it("repassa o intervalo e o limite pedidos", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/reports/merchants?from=2026-11-01&to=2026-11-14&limit=3",
      headers: bearer(ADMIN_TOKENS.admin),
    });
    expect(res.statusCode).toBe(200);
    expect(merchantCalls).toEqual([{ from: "2026-11-01", to: "2026-11-14", limit: 3 }]);
  });

  it("400 com limite zero", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/reports/merchants?limit=0",
      headers: bearer(ADMIN_TOKENS.admin),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_query");
    expect(merchantCalls).toHaveLength(0);
  });

  it("400 com limite acima de 50", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/reports/merchants?limit=51",
      headers: bearer(ADMIN_TOKENS.admin),
    });
    expect(res.statusCode).toBe(400);
    expect(merchantCalls).toHaveLength(0);
  });
});

describe("sem serviço de relatórios", () => {
  it("as rotas não existem", async () => {
    const res = await appWithout.inject({
      method: "GET",
      url: "/admin/v1/reports/summary",
      headers: bearer(ADMIN_TOKENS.admin),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("not_found");
  });
});
