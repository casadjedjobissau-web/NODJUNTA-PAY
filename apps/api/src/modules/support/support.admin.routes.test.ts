import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { loadEnv } from "../../config/env.js";
import { ADMIN_IDS, ADMIN_TOKENS, adminAuthenticator, makeFakeAdmin } from "../../testing/admin-fakes.js";
import { TEST_ENV, makeFakeDeps } from "../../testing/fakes.js";
import type { AdminTicketDetail, SupportAdminService } from "./support.admin.types.js";
import { SupportError, type SupportStatus } from "./support.types.js";

const env = loadEnv(TEST_ENV);
const TICKET = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const DETAIL: AdminTicketDetail = {
  id: TICKET,
  seq: 7,
  userId: "11111111-1111-4111-8111-111111111111",
  phone: "+245955000401",
  fullName: "Ana Gomes",
  category: "payment",
  subject: "Pagamento em falta",
  status: "open",
  createdAt: "2026-11-14T10:00:00.000Z",
  lastMessageAt: "2026-11-14T10:05:00.000Z",
  messages: [],
};

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

let app: Awaited<ReturnType<typeof buildApp>>;
let appWithout: Awaited<ReturnType<typeof buildApp>>;
let failure: Error | null = null;
let listCalls: Array<{ status: SupportStatus | null; limit: number }> = [];
let getCalls: Array<{ adminId: string; ticketId: string; ip: string | null }> = [];
let replyCalls: Array<{ adminId: string; ticketId: string; message: string; resolve: boolean }> = [];
let statusCalls: Array<{ adminId: string; ticketId: string; status: string }> = [];

const service: SupportAdminService = {
  list: async (status, limit) => {
    listCalls.push({ status, limit });
    return [];
  },
  get: async (adminId, ticketId, ip) => {
    getCalls.push({ adminId, ticketId, ip });
    if (failure) {
      throw failure;
    }
    return DETAIL;
  },
  reply: async (adminId, ticketId, message, resolve) => {
    replyCalls.push({ adminId, ticketId, message, resolve });
    if (failure) {
      throw failure;
    }
  },
  setStatus: async (adminId, ticketId, status) => {
    statusCalls.push({ adminId, ticketId, status });
    return status;
  },
};

beforeAll(async () => {
  app = await buildApp(
    env,
    makeFakeDeps({ authenticator: adminAuthenticator(), admin: makeFakeAdmin(), supportAdmin: service }),
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
  getCalls = [];
  replyCalls = [];
  statusCalls = [];
});

describe("acesso ao suporte do painel", () => {
  it("401 sem token", async () => {
    const res = await app.inject({ method: "GET", url: "/admin/v1/support/tickets" });
    expect(res.statusCode).toBe(401);
  });

  it("403 para um utilizador que não é administrador", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/support/tickets",
      headers: bearer(ADMIN_TOKENS.user),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("forbidden");
    expect(listCalls).toHaveLength(0);
  });
});

describe("lista de pedidos", () => {
  it("o papel support lista e usa 50 por omissão, sem filtro de estado", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/support/tickets",
      headers: bearer(ADMIN_TOKENS.support),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ items: [] });
    expect(listCalls).toEqual([{ status: null, limit: 50 }]);
  });

  it("repassa o filtro de estado e o limite", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/support/tickets?status=open&limit=10",
      headers: bearer(ADMIN_TOKENS.reviewer),
    });
    expect(res.statusCode).toBe(200);
    expect(listCalls).toEqual([{ status: "open", limit: 10 }]);
  });

  it("400 com um estado inválido", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/support/tickets?status=inventado",
      headers: bearer(ADMIN_TOKENS.support),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_query");
    expect(listCalls).toHaveLength(0);
  });
});

describe("detalhe de um pedido", () => {
  it("400 com identificador que não é UUID", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/v1/support/tickets/nao-e-uuid",
      headers: bearer(ADMIN_TOKENS.support),
    });
    expect(res.statusCode).toBe(400);
    expect(getCalls).toHaveLength(0);
  });

  it("200 devolve o pedido e o serviço recebe o administrador, o pedido e o IP", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/admin/v1/support/tickets/${TICKET}`,
      headers: bearer(ADMIN_TOKENS.support),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(DETAIL);
    expect(getCalls).toEqual([{ adminId: ADMIN_IDS.support, ticketId: TICKET, ip: "127.0.0.1" }]);
  });

  it("404 quando o pedido não existe", async () => {
    failure = new SupportError("ticket_not_found", 404, "Pedido de suporte não encontrado.");
    const res = await app.inject({
      method: "GET",
      url: `/admin/v1/support/tickets/${TICKET}`,
      headers: bearer(ADMIN_TOKENS.support),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("ticket_not_found");
  });
});

describe("responder a um pedido", () => {
  it("200 sem resolver por omissão", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/v1/support/tickets/${TICKET}/reply`,
      headers: bearer(ADMIN_TOKENS.support),
      payload: { message: "  Estamos a verificar.  " },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(replyCalls).toEqual([
      { adminId: ADMIN_IDS.support, ticketId: TICKET, message: "Estamos a verificar.", resolve: false },
    ]);
  });

  it("200 resolvendo o pedido", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/v1/support/tickets/${TICKET}/reply`,
      headers: bearer(ADMIN_TOKENS.admin),
      payload: { message: "Resolvido.", resolve: true },
    });
    expect(res.statusCode).toBe(200);
    expect(replyCalls[0]).toMatchObject({ adminId: ADMIN_IDS.admin, resolve: true });
  });

  it("400 com uma mensagem vazia", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/v1/support/tickets/${TICKET}/reply`,
      headers: bearer(ADMIN_TOKENS.support),
      payload: { message: "   " },
    });
    expect(res.statusCode).toBe(400);
    expect(replyCalls).toHaveLength(0);
  });

  it("400 com campos que não existem", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/v1/support/tickets/${TICKET}/reply`,
      headers: bearer(ADMIN_TOKENS.support),
      payload: { message: "Olá.", autor: "outro" },
    });
    expect(res.statusCode).toBe(400);
    expect(replyCalls).toHaveLength(0);
  });

  it("403 quando o administrador tenta tratar o próprio pedido", async () => {
    failure = new SupportError("not_allowed_on_self", 403, "Não pode tratar os seus próprios pedidos de suporte.");
    const res = await app.inject({
      method: "POST",
      url: `/admin/v1/support/tickets/${TICKET}/reply`,
      headers: bearer(ADMIN_TOKENS.support),
      payload: { message: "Olá." },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("not_allowed_on_self");
  });
});

describe("mudar o estado de um pedido", () => {
  it("200 devolve o novo estado", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/v1/support/tickets/${TICKET}/status`,
      headers: bearer(ADMIN_TOKENS.support),
      payload: { status: "resolved" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "resolved" });
    expect(statusCalls).toEqual([{ adminId: ADMIN_IDS.support, ticketId: TICKET, status: "resolved" }]);
  });

  it("400 com um estado que o suporte não pode definir", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/admin/v1/support/tickets/${TICKET}/status`,
      headers: bearer(ADMIN_TOKENS.support),
      payload: { status: "pending_user" },
    });
    expect(res.statusCode).toBe(400);
    expect(statusCalls).toHaveLength(0);
  });
});

describe("sem serviço de suporte de administração", () => {
  it("as rotas não existem", async () => {
    const res = await appWithout.inject({
      method: "GET",
      url: "/admin/v1/support/tickets",
      headers: bearer(ADMIN_TOKENS.support),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("not_found");
  });
});
