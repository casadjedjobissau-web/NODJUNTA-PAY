import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { loadEnv } from "../../config/env.js";
import { ADMIN_IDS, ADMIN_TOKENS, adminAuthenticator, makeFakeAdmin } from "../../testing/admin-fakes.js";
import { TEST_ENV, makeFakeDeps } from "../../testing/fakes.js";
import {
  PhoneChangeError,
  type CreatePhoneChangeInput,
  type PhoneChangeService,
  type PhoneChangeStatus,
} from "./phone-change.types.js";

const env = loadEnv(TEST_ENV);
const REQUEST = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const TARGET = "11111111-1111-4111-8111-111111111111";

const VALID = {
  userId: TARGET,
  newPhone: "+245955000799",
  reason: "Perdeu o cartão SIM",
  evidence: "Identidade verificada em videochamada de 14/11.",
};

let counter = 0;
function headers(token: string) {
  counter += 1;
  return {
    authorization: `Bearer ${token}`,
    "x-forwarded-for": `10.6.${Math.floor(counter / 250)}.${(counter % 250) + 1}`,
  };
}

let app: Awaited<ReturnType<typeof buildApp>>;
let appWithout: Awaited<ReturnType<typeof buildApp>>;
let failure: Error | null = null;
let listCalls: Array<{ status: PhoneChangeStatus | null; limit: number }> = [];
let createCalls: Array<{ adminId: string; input: CreatePhoneChangeInput }> = [];
let decideCalls: Array<{ adminId: string; id: string; approve: boolean; reason: string | null }> = [];

const service: PhoneChangeService = {
  list: async (status, limit) => {
    listCalls.push({ status, limit });
    return [];
  },
  create: async (adminId, input) => {
    createCalls.push({ adminId, input });
    if (failure) {
      throw failure;
    }
    return { id: REQUEST };
  },
  decide: async (adminId, id, approve, reason) => {
    decideCalls.push({ adminId, id, approve, reason });
    if (failure) {
      throw failure;
    }
    return approve ? "approved" : "rejected";
  },
};

beforeAll(async () => {
  app = await buildApp(
    env,
    makeFakeDeps({ authenticator: adminAuthenticator(), admin: makeFakeAdmin(), phoneChange: service }),
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
  createCalls = [];
  decideCalls = [];
});

describe("acesso às trocas de número", () => {
  it("401 sem token", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/v1/phone-changes" });
    expect(res.statusCode).toBe(401);
  });

  it("403 para um utilizador que não é administrador", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/phone-changes",
      headers: headers(ADMIN_TOKENS.user),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("forbidden");
    expect(listCalls).toHaveLength(0);
  });

  it("403 para o papel support ao listar", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/phone-changes",
      headers: headers(ADMIN_TOKENS.support),
    });
    expect(res.statusCode).toBe(403);
    expect(listCalls).toHaveLength(0);
  });

  it("403 para o papel support ao pedir uma troca", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/v1/phone-changes",
      headers: headers(ADMIN_TOKENS.support),
      payload: VALID,
    });
    expect(res.statusCode).toBe(403);
    expect(createCalls).toHaveLength(0);
  });
});

describe("GET /admin/v1/phone-changes", () => {
  it("o revisor lista e usa 50 por omissão, sem filtro de estado", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/phone-changes",
      headers: headers(ADMIN_TOKENS.reviewer),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ items: [] });
    expect(listCalls).toEqual([{ status: null, limit: 50 }]);
  });

  it("repassa o filtro de estado e o limite", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/phone-changes?status=pending&limit=10",
      headers: headers(ADMIN_TOKENS.admin),
    });
    expect(res.statusCode).toBe(200);
    expect(listCalls).toEqual([{ status: "pending", limit: 10 }]);
  });

  it("400 com um estado inválido", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/phone-changes?status=inventado",
      headers: headers(ADMIN_TOKENS.reviewer),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_query");
    expect(listCalls).toHaveLength(0);
  });
});

describe("POST /admin/v1/phone-changes (pedir)", () => {
  it("201 para o revisor, com os textos aparados e o administrador certo", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/v1/phone-changes",
      headers: headers(ADMIN_TOKENS.reviewer),
      payload: {
        ...VALID,
        reason: "  Perdeu o cartão SIM  ",
        evidence: "  Identidade verificada em videochamada de 14/11.  ",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ id: REQUEST });
    expect(createCalls).toEqual([{ adminId: ADMIN_IDS.reviewer, input: VALID }]);
  });

  it("201 também para o administrador", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/v1/phone-changes",
      headers: headers(ADMIN_TOKENS.admin),
      payload: VALID,
    });
    expect(res.statusCode).toBe(201);
    expect(createCalls[0]?.adminId).toBe(ADMIN_IDS.admin);
  });

  it("400 com um número que não é +245 e 9 dígitos", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/v1/phone-changes",
      headers: headers(ADMIN_TOKENS.reviewer),
      payload: { ...VALID, newPhone: "+351912345678" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_body");
    expect(createCalls).toHaveLength(0);
  });

  it("400 com um identificador de utilizador que não é UUID", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/v1/phone-changes",
      headers: headers(ADMIN_TOKENS.reviewer),
      payload: { ...VALID, userId: "nao-e-uuid" },
    });
    expect(res.statusCode).toBe(400);
    expect(createCalls).toHaveLength(0);
  });

  it("400 com uma nota de prova demasiado curta", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/v1/phone-changes",
      headers: headers(ADMIN_TOKENS.reviewer),
      payload: { ...VALID, evidence: "curta" },
    });
    expect(res.statusCode).toBe(400);
    expect(createCalls).toHaveLength(0);
  });

  it("400 com campos que não existem", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/v1/phone-changes",
      headers: headers(ADMIN_TOKENS.reviewer),
      payload: { ...VALID, status: "approved" },
    });
    expect(res.statusCode).toBe(400);
    expect(createCalls).toHaveLength(0);
  });

  it("403 quando o administrador tenta alterar a própria conta", async () => {
    failure = new PhoneChangeError("same_person_not_allowed", 403, "Ninguém pode alterar a própria conta.");
    const res = await app.inject({
      method: "POST",
      url: "/admin/v1/phone-changes",
      headers: headers(ADMIN_TOKENS.reviewer),
      payload: VALID,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("same_person_not_allowed");
  });

  it("409 quando o número já está em uso", async () => {
    failure = new PhoneChangeError("phone_unavailable", 409, "Este número já está em uso por outra conta.");
    const res = await app.inject({
      method: "POST",
      url: "/admin/v1/phone-changes",
      headers: headers(ADMIN_TOKENS.reviewer),
      payload: VALID,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("phone_unavailable");
  });
});

describe("POST /admin/v1/phone-changes/:id/decide (decidir)", () => {
  it("403 para o revisor, que pode pedir mas não decidir", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/v1/phone-changes/${REQUEST}/decide`,
      headers: headers(ADMIN_TOKENS.reviewer),
      payload: { approve: true },
    });
    expect(res.statusCode).toBe(403);
    expect(decideCalls).toHaveLength(0);
  });

  it("403 para o papel support", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/v1/phone-changes/${REQUEST}/decide`,
      headers: headers(ADMIN_TOKENS.support),
      payload: { approve: true },
    });
    expect(res.statusCode).toBe(403);
    expect(decideCalls).toHaveLength(0);
  });

  it("400 com um identificador que não é UUID", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/v1/phone-changes/nao-e-uuid/decide",
      headers: headers(ADMIN_TOKENS.admin),
      payload: { approve: true },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_params");
    expect(decideCalls).toHaveLength(0);
  });

  it("400 ao recusar sem motivo ou com um motivo só de espaços", async () => {
    for (const payload of [{ approve: false }, { approve: false, reason: "   " }]) {
      const res = await app.inject({
        method: "POST",
        url: `/admin/v1/phone-changes/${REQUEST}/decide`,
        headers: headers(ADMIN_TOKENS.admin),
        payload,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("invalid_body");
    }
    expect(decideCalls).toHaveLength(0);
  });

  it("200 aprova sem motivo", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/v1/phone-changes/${REQUEST}/decide`,
      headers: headers(ADMIN_TOKENS.admin),
      payload: { approve: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "approved" });
    expect(decideCalls).toEqual([{ adminId: ADMIN_IDS.admin, id: REQUEST, approve: true, reason: null }]);
  });

  it("200 recusa com motivo, aparado", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/v1/phone-changes/${REQUEST}/decide`,
      headers: headers(ADMIN_TOKENS.admin),
      payload: { approve: false, reason: "  Identidade não confirmada.  " },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "rejected" });
    expect(decideCalls).toEqual([
      { adminId: ADMIN_IDS.admin, id: REQUEST, approve: false, reason: "Identidade não confirmada." },
    ]);
  });

  it("403 quando quem pediu tenta decidir", async () => {
    failure = new PhoneChangeError("same_person_not_allowed", 403, "Quem abriu o pedido não o pode decidir.");
    const res = await app.inject({
      method: "POST",
      url: `/admin/v1/phone-changes/${REQUEST}/decide`,
      headers: headers(ADMIN_TOKENS.admin),
      payload: { approve: true },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("same_person_not_allowed");
  });

  it("409 quando o pedido já foi decidido", async () => {
    failure = new PhoneChangeError("invalid_state", 409, "O pedido já foi decidido.");
    const res = await app.inject({
      method: "POST",
      url: `/admin/v1/phone-changes/${REQUEST}/decide`,
      headers: headers(ADMIN_TOKENS.admin),
      payload: { approve: true },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("invalid_state");
  });

  it("404 quando o pedido não existe", async () => {
    failure = new PhoneChangeError("request_not_found", 404, "Pedido de troca de número não encontrado.");
    const res = await app.inject({
      method: "POST",
      url: `/admin/v1/phone-changes/${REQUEST}/decide`,
      headers: headers(ADMIN_TOKENS.admin),
      payload: { approve: true },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("request_not_found");
  });
});

describe("sem serviço de troca de número", () => {
  it("as rotas não existem", async () => {
    const res = await appWithout.inject({
      method: "GET",
      url: "/admin/v1/phone-changes",
      headers: headers(ADMIN_TOKENS.admin),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("not_found");
  });
});
