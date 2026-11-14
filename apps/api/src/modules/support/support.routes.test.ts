import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { loadEnv } from "../../config/env.js";
import { TEST_ENV, TEST_USER, VALID_TOKEN, makeFakeDeps } from "../../testing/fakes.js";
import {
  SupportError,
  type CreateTicketInput,
  type ListTicketsOptions,
  type SupportService,
  type TicketDetail,
  type TicketPage,
} from "./support.types.js";

const env = loadEnv(TEST_ENV);
const TICKET = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const DETAIL: TicketDetail = {
  id: TICKET,
  seq: 7,
  category: "payment",
  subject: "Pagamento em falta",
  status: "open",
  createdAt: "2026-11-14T10:00:00.000Z",
  lastMessageAt: "2026-11-14T10:05:00.000Z",
  messages: [
    {
      id: "m1",
      seq: 1,
      author: "user",
      body: "O meu pagamento não chegou.",
      createdAt: "2026-11-14T10:00:00.000Z",
    },
  ],
};

const PAGE: TicketPage = {
  items: [
    {
      id: TICKET,
      seq: 7,
      category: "payment",
      subject: "Pagamento em falta",
      status: "open",
      createdAt: "2026-11-14T10:00:00.000Z",
      lastMessageAt: "2026-11-14T10:05:00.000Z",
    },
  ],
  nextCursor: null,
};

let counter = 0;
function ip() {
  counter += 1;
  return { "x-forwarded-for": `10.8.${Math.floor(counter / 250)}.${(counter % 250) + 1}` };
}

function auth() {
  return { ...ip(), authorization: `Bearer ${VALID_TOKEN}` };
}

let app: Awaited<ReturnType<typeof buildApp>>;
let appWithout: Awaited<ReturnType<typeof buildApp>>;
let failure: Error | null = null;
let createCalls: Array<{ userId: string; input: CreateTicketInput }> = [];
let listCalls: Array<{ userId: string; options: ListTicketsOptions }> = [];
let getCalls: Array<{ userId: string; id: string }> = [];
let replyCalls: Array<{ userId: string; id: string; message: string }> = [];
let closeCalls: Array<{ userId: string; id: string }> = [];

const service: SupportService = {
  createTicket: async (userId, input) => {
    createCalls.push({ userId, input });
    if (failure) {
      throw failure;
    }
    return DETAIL;
  },
  list: async (userId, options) => {
    listCalls.push({ userId, options });
    return PAGE;
  },
  get: async (userId, id) => {
    getCalls.push({ userId, id });
    if (failure) {
      throw failure;
    }
    return DETAIL;
  },
  reply: async (userId, id, message) => {
    replyCalls.push({ userId, id, message });
    if (failure) {
      throw failure;
    }
    return DETAIL;
  },
  close: async (userId, id) => {
    closeCalls.push({ userId, id });
    if (failure) {
      throw failure;
    }
    return DETAIL;
  },
};

const validCreate = {
  category: "payment",
  subject: "Pagamento em falta",
  message: "O meu pagamento não chegou.",
};

beforeAll(async () => {
  app = await buildApp(env, makeFakeDeps({ support: service }));
  appWithout = await buildApp(env, makeFakeDeps());
});
afterAll(async () => {
  await app.close();
  await appWithout.close();
});
beforeEach(() => {
  failure = null;
  createCalls = [];
  listCalls = [];
  getCalls = [];
  replyCalls = [];
  closeCalls = [];
});

describe("GET /v1/support/tickets", () => {
  it("401 sem token", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/support/tickets", headers: ip() });
    expect(res.statusCode).toBe(401);
  });

  it("200 devolve a página e usa 20 por omissão", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/support/tickets", headers: auth() });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(PAGE);
    expect(listCalls).toEqual([{ userId: TEST_USER.id, options: { limit: 20 } }]);
  });

  it("repassa limit e before ao serviço", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/support/tickets?limit=5&before=50",
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    expect(listCalls[0]?.options).toEqual({ limit: 5, before: 50 });
  });

  it("400 com limit acima de 50", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/support/tickets?limit=51", headers: auth() });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_query");
    expect(listCalls).toHaveLength(0);
  });
});

describe("POST /v1/support/tickets", () => {
  it("401 sem token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/support/tickets",
      headers: ip(),
      payload: validCreate,
    });
    expect(res.statusCode).toBe(401);
    expect(createCalls).toHaveLength(0);
  });

  it("400 sem assunto", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/support/tickets",
      headers: auth(),
      payload: { category: "payment", message: "O meu pagamento não chegou." },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_body");
  });

  it("400 com categoria desconhecida", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/support/tickets",
      headers: auth(),
      payload: { ...validCreate, category: "inventada" },
    });
    expect(res.statusCode).toBe(400);
    expect(createCalls).toHaveLength(0);
  });

  it("400 com uma mensagem demasiado curta", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/support/tickets",
      headers: auth(),
      payload: { ...validCreate, message: "ola" },
    });
    expect(res.statusCode).toBe(400);
    expect(createCalls).toHaveLength(0);
  });

  it("400 com campos que não existem", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/support/tickets",
      headers: auth(),
      payload: { ...validCreate, status: "closed" },
    });
    expect(res.statusCode).toBe(400);
    expect(createCalls).toHaveLength(0);
  });

  it("201 cria o pedido e o serviço recebe os textos aparados", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/support/tickets",
      headers: auth(),
      payload: { ...validCreate, subject: "  Pagamento em falta  ", message: "  O meu pagamento não chegou.  " },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual(DETAIL);
    expect(createCalls).toEqual([{ userId: TEST_USER.id, input: validCreate }]);
  });

  it("429 quando já tem 5 pedidos abertos", async () => {
    failure = new SupportError("too_many_open_tickets", 429, "Já tem 5 pedidos abertos.");
    const res = await app.inject({
      method: "POST",
      url: "/v1/support/tickets",
      headers: auth(),
      payload: validCreate,
    });
    expect(res.statusCode).toBe(429);
    expect(res.json().error).toBe("too_many_open_tickets");
  });
});

describe("GET /v1/support/tickets/:id", () => {
  it("400 com identificador que não é UUID", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/support/tickets/nao-e-uuid", headers: auth() });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_params");
    expect(getCalls).toHaveLength(0);
  });

  it("200 devolve o pedido do utilizador autenticado", async () => {
    const res = await app.inject({ method: "GET", url: `/v1/support/tickets/${TICKET}`, headers: auth() });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(DETAIL);
    expect(getCalls).toEqual([{ userId: TEST_USER.id, id: TICKET }]);
  });

  it("404 quando o pedido não existe ou é de outro utilizador", async () => {
    failure = new SupportError("ticket_not_found", 404, "Pedido de suporte não encontrado.");
    const res = await app.inject({ method: "GET", url: `/v1/support/tickets/${TICKET}`, headers: auth() });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("ticket_not_found");
  });
});

describe("POST /v1/support/tickets/:id/messages", () => {
  it("400 com uma mensagem vazia", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/v1/support/tickets/${TICKET}/messages`,
      headers: auth(),
      payload: { message: "   " },
    });
    expect(res.statusCode).toBe(400);
    expect(replyCalls).toHaveLength(0);
  });

  it("201 envia a mensagem", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/v1/support/tickets/${TICKET}/messages`,
      headers: auth(),
      payload: { message: "Obrigado." },
    });
    expect(res.statusCode).toBe(201);
    expect(replyCalls).toEqual([{ userId: TEST_USER.id, id: TICKET, message: "Obrigado." }]);
  });

  it("409 quando o pedido está fechado", async () => {
    failure = new SupportError("ticket_closed", 409, "Este pedido está fechado.");
    const res = await app.inject({
      method: "POST",
      url: `/v1/support/tickets/${TICKET}/messages`,
      headers: auth(),
      payload: { message: "Obrigado." },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("ticket_closed");
  });
});

describe("POST /v1/support/tickets/:id/close", () => {
  it("200 fecha o pedido do utilizador autenticado", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/v1/support/tickets/${TICKET}/close`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    expect(closeCalls).toEqual([{ userId: TEST_USER.id, id: TICKET }]);
  });

  it("404 quando o pedido não existe", async () => {
    failure = new SupportError("ticket_not_found", 404, "Pedido de suporte não encontrado.");
    const res = await app.inject({
      method: "POST",
      url: `/v1/support/tickets/${TICKET}/close`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("ticket_not_found");
  });
});

describe("sem serviço de suporte", () => {
  it("as rotas não existem", async () => {
    const res = await appWithout.inject({ method: "GET", url: "/v1/support/tickets", headers: auth() });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("not_found");
  });
});
