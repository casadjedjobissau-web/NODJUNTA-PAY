import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { loadEnv } from "../../config/env.js";
import { ADMIN_IDS, ADMIN_TOKENS, adminAuthenticator, makeFakeAdmin } from "../../testing/admin-fakes.js";
import { TEST_ENV, makeFakeDeps } from "../../testing/fakes.js";
import { FraudError, type FraudAdminService, type FraudAlertStatus } from "./fraud.types.js";

const env = loadEnv(TEST_ENV);
const ALERT = "ffffffff-ffff-4fff-8fff-ffffffffffff";

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

let app: Awaited<ReturnType<typeof buildApp>>;
let appWithout: Awaited<ReturnType<typeof buildApp>>;
let failure: Error | null = null;
let listCalls: Array<{ status: FraudAlertStatus | null; limit: number }> = [];
let reviewCalls: Array<{ adminId: string; alertId: string; note: string | null }> = [];

const service: FraudAdminService = {
  list: async (status, limit) => {
    listCalls.push({ status, limit });
    return [];
  },
  review: async (adminId, alertId, note) => {
    reviewCalls.push({ adminId, alertId, note });
    if (failure) {
      throw failure;
    }
    return "reviewed";
  },
};

beforeAll(async () => {
  app = await buildApp(
    env,
    makeFakeDeps({ authenticator: adminAuthenticator(), admin: makeFakeAdmin(), fraudAdmin: service }),
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
  listCalls = [];
  reviewCalls = [];
});

describe("acesso aos alertas de fraude", () => {
  it("401 sem token", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/v1/fraud/alerts" });
    expect(res.statusCode).toBe(401);
  });

  it("403 para um utilizador que não é administrador", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/fraud/alerts",
      headers: bearer(ADMIN_TOKENS.user),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("forbidden");
    expect(listCalls).toHaveLength(0);
  });

  it("403 para o papel support", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/fraud/alerts",
      headers: bearer(ADMIN_TOKENS.support),
    });
    expect(res.statusCode).toBe(403);
    expect(listCalls).toHaveLength(0);
  });

  it("200 para o revisor", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/fraud/alerts",
      headers: bearer(ADMIN_TOKENS.reviewer),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ items: [] });
  });

  it("200 para o administrador", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/fraud/alerts",
      headers: bearer(ADMIN_TOKENS.admin),
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("GET /admin/v1/fraud/alerts", () => {
  it("usa 50 por omissão e sem filtro de estado", async () => {
    await app.inject({
      method: "GET",
      url: "/admin/v1/fraud/alerts",
      headers: bearer(ADMIN_TOKENS.reviewer),
    });
    expect(listCalls).toEqual([{ status: null, limit: 50 }]);
  });

  it("repassa o filtro de estado e o limite", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/fraud/alerts?status=open&limit=10",
      headers: bearer(ADMIN_TOKENS.reviewer),
    });
    expect(res.statusCode).toBe(200);
    expect(listCalls).toEqual([{ status: "open", limit: 10 }]);
  });

  it("400 com um estado inválido", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/fraud/alerts?status=inventado",
      headers: bearer(ADMIN_TOKENS.reviewer),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_query");
    expect(listCalls).toHaveLength(0);
  });

  it("400 com um limite fora de 1 a 100", async () => {
    for (const limit of ["0", "101"]) {
      const res = await app.inject({
        method: "GET",
        url: `/admin/v1/fraud/alerts?limit=${limit}`,
        headers: bearer(ADMIN_TOKENS.reviewer),
      });
      expect(res.statusCode).toBe(400);
    }
    expect(listCalls).toHaveLength(0);
  });
});

describe("POST /admin/v1/fraud/alerts/:id/review", () => {
  it("403 para o papel support", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/v1/fraud/alerts/${ALERT}/review`,
      headers: bearer(ADMIN_TOKENS.support),
    });
    expect(res.statusCode).toBe(403);
    expect(reviewCalls).toHaveLength(0);
  });

  it("400 com um identificador que não é UUID", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/v1/fraud/alerts/nao-e-uuid/review",
      headers: bearer(ADMIN_TOKENS.reviewer),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_params");
    expect(reviewCalls).toHaveLength(0);
  });

  it("200 sem corpo: a nota fica nula", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/v1/fraud/alerts/${ALERT}/review`,
      headers: bearer(ADMIN_TOKENS.reviewer),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "reviewed" });
    expect(reviewCalls).toEqual([{ adminId: ADMIN_IDS.reviewer, alertId: ALERT, note: null }]);
  });

  it("200 com nota aparada", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/v1/fraud/alerts/${ALERT}/review`,
      headers: bearer(ADMIN_TOKENS.admin),
      payload: { note: "  Cliente contactado.  " },
    });
    expect(res.statusCode).toBe(200);
    expect(reviewCalls).toEqual([{ adminId: ADMIN_IDS.admin, alertId: ALERT, note: "Cliente contactado." }]);
  });

  it("400 com uma nota de mais de 300 caracteres", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/v1/fraud/alerts/${ALERT}/review`,
      headers: bearer(ADMIN_TOKENS.reviewer),
      payload: { note: "x".repeat(301) },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_body");
    expect(reviewCalls).toHaveLength(0);
  });

  it("400 com campos que não existem", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/v1/fraud/alerts/${ALERT}/review`,
      headers: bearer(ADMIN_TOKENS.reviewer),
      payload: { note: "ok", estado: "reviewed" },
    });
    expect(res.statusCode).toBe(400);
    expect(reviewCalls).toHaveLength(0);
  });

  it("403 quando o alerta é da própria conta do administrador", async () => {
    failure = new FraudError("not_allowed_on_self", 403, "Não pode tratar alertas da sua própria conta.");
    const res = await app.inject({
      method: "POST",
      url: `/admin/v1/fraud/alerts/${ALERT}/review`,
      headers: bearer(ADMIN_TOKENS.reviewer),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("not_allowed_on_self");
  });

  it("404 quando o alerta não existe", async () => {
    failure = new FraudError("alert_not_found", 404, "Alerta não encontrado.");
    const res = await app.inject({
      method: "POST",
      url: `/admin/v1/fraud/alerts/${ALERT}/review`,
      headers: bearer(ADMIN_TOKENS.reviewer),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("alert_not_found");
  });
});

describe("sem serviço de alertas", () => {
  it("as rotas não existem", async () => {
    const res = await appWithout.inject({
      method: "GET",
      url: "/admin/v1/fraud/alerts",
      headers: bearer(ADMIN_TOKENS.admin),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("not_found");
  });
});
