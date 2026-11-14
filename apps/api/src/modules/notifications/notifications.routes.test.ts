import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { loadEnv } from "../../config/env.js";
import { TEST_ENV, TEST_USER, VALID_TOKEN, makeFakeDeps } from "../../testing/fakes.js";
import {
  NotificationError,
  type ListOptions,
  type NotificationPage,
  type NotificationService,
} from "./notifications.types.js";

const env = loadEnv(TEST_ENV);
const auth = { authorization: `Bearer ${VALID_TOKEN}` };
const ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const PAGE: NotificationPage = {
  items: [
    {
      id: ID,
      seq: 9,
      kind: "transfer_received",
      title: "Dinheiro recebido",
      body: "Recebeu 4 000 XOF.",
      data: { amount: 4000 },
      read: false,
      createdAt: "2026-11-14T10:00:00.000Z",
    },
  ],
  nextCursor: null,
  unreadCount: 1,
};

let app: Awaited<ReturnType<typeof buildApp>>;
let appWithout: Awaited<ReturnType<typeof buildApp>>;
let listCalls: Array<{ userId: string; options: ListOptions }> = [];
let markCalls: Array<{ userId: string; id: string }> = [];
let markAllCalls: string[] = [];
let markError: Error | null = null;

const service: NotificationService = {
  list: async (userId, options) => {
    listCalls.push({ userId, options });
    return PAGE;
  },
  markRead: async (userId, id) => {
    markCalls.push({ userId, id });
    if (markError) {
      throw markError;
    }
  },
  markAllRead: async (userId) => {
    markAllCalls.push(userId);
    return 3;
  },
};

beforeAll(async () => {
  app = await buildApp(env, makeFakeDeps({ notifications: service }));
  appWithout = await buildApp(env, makeFakeDeps());
});
afterAll(async () => {
  await app.close();
  await appWithout.close();
});
beforeEach(() => {
  listCalls = [];
  markCalls = [];
  markAllCalls = [];
  markError = null;
});

describe("GET /v1/notifications", () => {
  it("401 sem token", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/notifications" });
    expect(res.statusCode).toBe(401);
  });

  it("200 devolve a página e usa 20 por omissão", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/notifications", headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(PAGE);
    expect(listCalls).toEqual([{ userId: TEST_USER.id, options: { limit: 20 } }]);
  });

  it("repassa limit e before ao serviço", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/notifications?limit=5&before=50",
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    expect(listCalls[0]?.options).toEqual({ limit: 5, before: 50 });
  });

  it("400 com limit zero ou acima de 50", async () => {
    for (const limit of ["0", "51"]) {
      const res = await app.inject({
        method: "GET",
        url: `/v1/notifications?limit=${limit}`,
        headers: auth,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("invalid_query");
    }
    expect(listCalls).toHaveLength(0);
  });
});

describe("POST /v1/notifications/read-all", () => {
  it("401 sem token", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/notifications/read-all" });
    expect(res.statusCode).toBe(401);
  });

  it("200 devolve quantas foram marcadas", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/notifications/read-all", headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ updated: 3 });
    expect(markAllCalls).toEqual([TEST_USER.id]);
  });
});

describe("POST /v1/notifications/:id/read", () => {
  it("400 com identificador que não é UUID", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/notifications/nao-e-uuid/read",
      headers: auth,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_params");
    expect(markCalls).toHaveLength(0);
  });

  it("200 marca a notificação do utilizador autenticado", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/v1/notifications/${ID}/read`,
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(markCalls).toEqual([{ userId: TEST_USER.id, id: ID }]);
  });

  it("404 quando a notificação não existe ou é de outro utilizador", async () => {
    markError = new NotificationError("notification_not_found", 404, "Notificação não encontrada.");
    const res = await app.inject({
      method: "POST",
      url: `/v1/notifications/${ID}/read`,
      headers: auth,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("notification_not_found");
  });
});

describe("sem serviço de notificações", () => {
  it("as rotas não existem", async () => {
    const res = await appWithout.inject({ method: "GET", url: "/v1/notifications", headers: auth });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("not_found");
  });
});
