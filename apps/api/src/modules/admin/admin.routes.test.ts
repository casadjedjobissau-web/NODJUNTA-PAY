import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { loadEnv } from "../../config/env.js";
import {
  ADMIN_IDS,
  ADMIN_TOKENS,
  SUB_ID,
  TARGET_USER_ID,
  adminAuthenticator,
  makeFakeAdmin,
} from "../../testing/admin-fakes.js";
import { TEST_ENV, makeFakeDeps } from "../../testing/fakes.js";
import { AdminError } from "./admin.types.js";

const env = loadEnv(TEST_ENV);

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

let app: Awaited<ReturnType<typeof buildApp>>;
let calls: Record<string, unknown[]> = {};
let nextReviewError: Error | null = null;

function record(name: string, args: unknown): void {
  calls[name] = [...(calls[name] ?? []), args];
}

beforeAll(async () => {
  const admin = makeFakeAdmin({
    listKyc: async (status, limit) => {
      record("listKyc", { status, limit });
      return [];
    },
    kycDocuments: async (adminId, submissionId) => {
      record("kycDocuments", { adminId, submissionId });
      return [{ kind: "front", url: "https://exemplo.local/front", expiresInSeconds: 60 }];
    },
    reviewKyc: async (adminId, submissionId, approve, reason) => {
      record("reviewKyc", { adminId, submissionId, approve, reason });
      if (nextReviewError) {
        throw nextReviewError;
      }
      return approve ? "approved" : "rejected";
    },
    setMerchantStatus: async (adminId, code, status) => {
      record("setMerchantStatus", { adminId, code, status });
      return status;
    },
    lookupUser: async (adminId, phone) => {
      record("lookupUser", { adminId, phone });
      return phone === "+245955000002"
        ? {
            userId: TARGET_USER_ID,
            phone,
            fullName: "Maria Gomes",
            kycLevel: 1,
            walletBalance: 5000,
            walletStatus: "active",
            merchantCode: null,
            createdAt: "2026-11-10T12:00:00.000Z",
          }
        : null;
    },
    setWalletFrozen: async (adminId, userId, frozen, reason) => {
      record("setWalletFrozen", { adminId, userId, frozen, reason });
      return frozen ? "frozen" : "active";
    },
    listAudit: async (limit, before) => {
      record("listAudit", { limit, before });
      return { items: [], nextCursor: null };
    },
  });
  app = await buildApp(env, makeFakeDeps({ authenticator: adminAuthenticator(), admin }));
});
afterAll(async () => {
  await app.close();
});
beforeEach(() => {
  calls = {};
  nextReviewError = null;
});

describe("acesso ao painel", () => {
  it("401 sem token", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/v1/overview" });
    expect(res.statusCode).toBe(401);
  });

  it("403 para um utilizador que não é administrador", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/overview",
      headers: bearer(ADMIN_TOKENS.user),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("forbidden");
  });

  it("GET /me devolve o papel e as permissões", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/me",
      headers: bearer(ADMIN_TOKENS.support),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().role).toBe("support");
    expect(res.json().permissions).toContain("overview:read");
    expect(res.json().permissions).not.toContain("kyc:read");
  });

  it("support lê o resumo", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/overview",
      headers: bearer(ADMIN_TOKENS.support),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().pendingKyc).toBe(2);
  });
});

describe("KYC", () => {
  it("support não pode listar pedidos de KYC", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/kyc/submissions",
      headers: bearer(ADMIN_TOKENS.support),
    });
    expect(res.statusCode).toBe(403);
    expect(calls.listKyc).toBeUndefined();
  });

  it("reviewer lista pedidos e o serviço recebe estado e limite", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/kyc/submissions?status=approved&limit=10",
      headers: bearer(ADMIN_TOKENS.reviewer),
    });
    expect(res.statusCode).toBe(200);
    expect(calls.listKyc).toEqual([{ status: "approved", limit: 10 }]);
  });

  it("documentos: reviewer obtém links e o serviço recebe o administrador e o pedido", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/v1/kyc/submissions/${SUB_ID}/documents`,
      headers: bearer(ADMIN_TOKENS.reviewer),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().documents).toHaveLength(1);
    expect(calls.kycDocuments).toEqual([{ adminId: ADMIN_IDS.reviewer, submissionId: SUB_ID }]);
  });

  it("documentos: 400 com identificador inválido", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/kyc/submissions/nao-e-uuid/documents",
      headers: bearer(ADMIN_TOKENS.reviewer),
    });
    expect(res.statusCode).toBe(400);
    expect(calls.kycDocuments).toBeUndefined();
  });

  it("revisão: 400 ao recusar sem motivo", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/v1/kyc/submissions/${SUB_ID}/review`,
      headers: bearer(ADMIN_TOKENS.reviewer),
      payload: { approve: false },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_body");
    expect(calls.reviewKyc).toBeUndefined();
  });

  it("revisão: aprovar repassa os dados ao serviço", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/v1/kyc/submissions/${SUB_ID}/review`,
      headers: bearer(ADMIN_TOKENS.reviewer),
      payload: { approve: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "approved" });
    expect(calls.reviewKyc).toEqual([
      { adminId: ADMIN_IDS.reviewer, submissionId: SUB_ID, approve: true, reason: null },
    ]);
  });

  it("revisão: erro de negócio do serviço vira resposta HTTP", async () => {
    nextReviewError = new AdminError("not_allowed_on_self", 403, "Não pode rever o próprio pedido.");
    const res = await app.inject({
      method: "POST",
      url: `/admin/v1/kyc/submissions/${SUB_ID}/review`,
      headers: bearer(ADMIN_TOKENS.reviewer),
      payload: { approve: true },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("not_allowed_on_self");
  });
});

describe("comerciantes", () => {
  it("support lista comerciantes", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/merchants?status=pending",
      headers: bearer(ADMIN_TOKENS.support),
    });
    expect(res.statusCode).toBe(200);
  });

  it("support não pode mudar o estado", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/v1/merchants/AB12CD34/status",
      headers: bearer(ADMIN_TOKENS.support),
      payload: { status: "active" },
    });
    expect(res.statusCode).toBe(403);
    expect(calls.setMerchantStatus).toBeUndefined();
  });

  it("reviewer ativa um comerciante", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/v1/merchants/AB12CD34/status",
      headers: bearer(ADMIN_TOKENS.reviewer),
      payload: { status: "active" },
    });
    expect(res.statusCode).toBe(200);
    expect(calls.setMerchantStatus).toEqual([
      { adminId: ADMIN_IDS.reviewer, code: "AB12CD34", status: "active" },
    ]);
  });

  it("400 com estado inválido", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/v1/merchants/AB12CD34/status",
      headers: bearer(ADMIN_TOKENS.reviewer),
      payload: { status: "pending" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("utilizadores", () => {
  it("lookup: 400 com telefone inválido", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/users/lookup?phone=955000002",
      headers: bearer(ADMIN_TOKENS.support),
    });
    expect(res.statusCode).toBe(400);
    expect(calls.lookupUser).toBeUndefined();
  });

  it("lookup: aceita o + codificado (%2B) e devolve o utilizador", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/users/lookup?phone=%2B245955000002",
      headers: bearer(ADMIN_TOKENS.support),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().userId).toBe(TARGET_USER_ID);
    expect(calls.lookupUser).toEqual([{ adminId: ADMIN_IDS.support, phone: "+245955000002" }]);
  });

  it("lookup: aceita o + que chegou como espaço", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/users/lookup?phone=+245955000002",
      headers: bearer(ADMIN_TOKENS.support),
    });
    expect(res.statusCode).toBe(200);
    expect(calls.lookupUser).toEqual([{ adminId: ADMIN_IDS.support, phone: "+245955000002" }]);
  });

  it("lookup: 404 quando não existe", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/users/lookup?phone=%2B245955999999",
      headers: bearer(ADMIN_TOKENS.support),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("user_not_found");
  });

  it("congelar: reviewer não pode", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/v1/users/${TARGET_USER_ID}/freeze`,
      headers: bearer(ADMIN_TOKENS.reviewer),
      payload: { frozen: true, reason: "suspeita" },
    });
    expect(res.statusCode).toBe(403);
    expect(calls.setWalletFrozen).toBeUndefined();
  });

  it("congelar: 400 sem motivo", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/v1/users/${TARGET_USER_ID}/freeze`,
      headers: bearer(ADMIN_TOKENS.admin),
      payload: { frozen: true },
    });
    expect(res.statusCode).toBe(400);
    expect(calls.setWalletFrozen).toBeUndefined();
  });

  it("congelar: admin congela com motivo; descongelar não exige motivo", async () => {
    const frozen = await app.inject({
      method: "POST",
      url: `/admin/v1/users/${TARGET_USER_ID}/freeze`,
      headers: bearer(ADMIN_TOKENS.admin),
      payload: { frozen: true, reason: "suspeita de fraude" },
    });
    expect(frozen.statusCode).toBe(200);
    expect(frozen.json()).toEqual({ status: "frozen" });

    const active = await app.inject({
      method: "POST",
      url: `/admin/v1/users/${TARGET_USER_ID}/freeze`,
      headers: bearer(ADMIN_TOKENS.admin),
      payload: { frozen: false },
    });
    expect(active.statusCode).toBe(200);
    expect(active.json()).toEqual({ status: "active" });
    expect(calls.setWalletFrozen).toEqual([
      { adminId: ADMIN_IDS.admin, userId: TARGET_USER_ID, frozen: true, reason: "suspeita de fraude" },
      { adminId: ADMIN_IDS.admin, userId: TARGET_USER_ID, frozen: false, reason: null },
    ]);
  });
});

describe("auditoria", () => {
  it("reviewer não pode consultar a auditoria", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/audit",
      headers: bearer(ADMIN_TOKENS.reviewer),
    });
    expect(res.statusCode).toBe(403);
  });

  it("admin consulta a auditoria e o serviço recebe limite e cursor", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/audit?limit=25&before=90",
      headers: bearer(ADMIN_TOKENS.admin),
    });
    expect(res.statusCode).toBe(200);
    expect(calls.listAudit).toEqual([{ limit: 25, before: 90 }]);
  });
});
