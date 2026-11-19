import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { loadEnv } from "../config/env.js";
import { ADMIN_IDS, makeFakeAdmin } from "../testing/admin-fakes.js";
import { TEST_ENV, makeFakeDeps } from "../testing/fakes.js";
import type { Authenticator } from "./auth.js";
import { MFA_REQUIRED_MESSAGE } from "./admin-mfa.js";

const env = loadEnv(TEST_ENV);

const TOKENS = {
  adminAal2: "tk-admin-aal2",
  adminAal1: "tk-admin-aal1",
  adminNoAal: "tk-admin-sem-aal",
  userAal2: "tk-cliente-aal2",
  userAal1: "tk-cliente-aal1",
} as const;

const authenticator: Authenticator = async (token) => {
  switch (token) {
    case TOKENS.adminAal2:
      return { id: ADMIN_IDS.admin, phone: null, aal: "aal2" };
    case TOKENS.adminAal1:
      return { id: ADMIN_IDS.admin, phone: null, aal: "aal1" };
    case TOKENS.adminNoAal:
      return { id: ADMIN_IDS.admin, phone: null };
    case TOKENS.userAal2:
      return { id: ADMIN_IDS.user, phone: null, aal: "aal2" };
    case TOKENS.userAal1:
      return { id: ADMIN_IDS.user, phone: null, aal: "aal1" };
    default:
      return null;
  }
};

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

let appRequired: Awaited<ReturnType<typeof buildApp>>;
let appOptional: Awaited<ReturnType<typeof buildApp>>;
let overviewCalls = 0;

function makeDeps(adminMfaRequired?: boolean) {
  const admin = makeFakeAdmin({
    overview: async () => {
      overviewCalls += 1;
      return { pendingKyc: 2, pendingMerchants: 1, pendingFunding: 0, failedWebhooks: 0, frozenWallets: 0 };
    },
  });
  return makeFakeDeps(
    adminMfaRequired === undefined ? { authenticator, admin } : { authenticator, admin, adminMfaRequired },
  );
}

beforeAll(async () => {
  appRequired = await buildApp(env, makeDeps(true));
  appOptional = await buildApp(env, makeDeps());
});
afterAll(async () => {
  await appRequired.close();
  await appOptional.close();
});
beforeEach(() => {
  overviewCalls = 0;
});

describe("MFA obrigatório na administração", () => {
  it("401 sem token", async () => {
    const res = await appRequired.inject({ method: "GET", url: "/admin/v1/overview" });
    expect(res.statusCode).toBe(401);
  });

  it("403 mfa_required para um administrador que entrou só com aal1", async () => {
    const res = await appRequired.inject({
      method: "GET",
      url: "/admin/v1/overview",
      headers: bearer(TOKENS.adminAal1),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("mfa_required");
    expect(overviewCalls).toBe(0);
  });

  it("403 mfa_required quando o token não traz o nível (falha fechada)", async () => {
    const res = await appRequired.inject({
      method: "GET",
      url: "/admin/v1/overview",
      headers: bearer(TOKENS.adminNoAal),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("mfa_required");
    expect(overviewCalls).toBe(0);
  });

  it("200 para um administrador com aal2", async () => {
    const res = await appRequired.inject({
      method: "GET",
      url: "/admin/v1/overview",
      headers: bearer(TOKENS.adminAal2),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().pendingKyc).toBe(2);
    expect(overviewCalls).toBe(1);
  });

  it("403 forbidden para um cliente com aal2: o papel continua a ser verificado", async () => {
    const res = await appRequired.inject({
      method: "GET",
      url: "/admin/v1/overview",
      headers: bearer(TOKENS.userAal2),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("forbidden");
  });

  it("403 mfa_required para um cliente com aal1: não revela se a conta é de administração", async () => {
    const res = await appRequired.inject({
      method: "GET",
      url: "/admin/v1/overview",
      headers: bearer(TOKENS.userAal1),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("mfa_required");
  });

  it("aplica-se a todas as rotas de administração, como /admin/v1/me", async () => {
    const without = await appRequired.inject({
      method: "GET",
      url: "/admin/v1/me",
      headers: bearer(TOKENS.adminAal1),
    });
    expect(without.statusCode).toBe(403);
    expect(without.json().error).toBe("mfa_required");

    const withMfa = await appRequired.inject({
      method: "GET",
      url: "/admin/v1/me",
      headers: bearer(TOKENS.adminAal2),
    });
    expect(withMfa.statusCode).toBe(200);
    expect(withMfa.json().role).toBe("admin");
  });

  it("aplica-se também às rotas que escrevem, antes de qualquer validação do corpo", async () => {
    const res = await appRequired.inject({
      method: "POST",
      url: "/admin/v1/merchants/AB12CD34/status",
      headers: bearer(TOKENS.adminAal1),
      payload: { status: "active" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("mfa_required");
  });

  it("a mensagem explica que é preciso a verificação em dois passos", async () => {
    const res = await appRequired.inject({
      method: "GET",
      url: "/admin/v1/overview",
      headers: bearer(TOKENS.adminAal1),
    });
    expect(res.json().message).toBe(MFA_REQUIRED_MESSAGE);
    expect(res.json().message).toContain("dois passos");
  });

  it("sem a exigência ligada, um administrador com aal1 entra", async () => {
    const res = await appOptional.inject({
      method: "GET",
      url: "/admin/v1/overview",
      headers: bearer(TOKENS.adminAal1),
    });
    expect(res.statusCode).toBe(200);
    expect(overviewCalls).toBe(1);
  });

  it("as rotas dos clientes não são afetadas pela exigência", async () => {
    const res = await appRequired.inject({
      method: "GET",
      url: "/v1/wallet",
      headers: bearer(TOKENS.userAal1),
    });
    expect(res.statusCode).toBe(401);
  });

  it("o endereço público do suporte não é afetado", async () => {
    const res = await appRequired.inject({ method: "GET", url: "/public/support" });
    expect(res.statusCode).toBe(200);
  });
});
