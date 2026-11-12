import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { loadEnv } from "../../config/env.js";
import { signPayload } from "../../lib/webhook-signature.js";
import { TEST_ENV, makeFakeDeps } from "../../testing/fakes.js";
import type { WebhookEvent, WebhookOutcome } from "./webhooks.types.js";

const SECRET = "segredo-de-teste-com-mais-de-32-caracteres";
const env = loadEnv(TEST_ENV);

let app: Awaited<ReturnType<typeof buildApp>>;
let events: Array<{ provider: string; event: WebhookEvent }> = [];
let outcome: WebhookOutcome = "processed";

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function signed(body: string, timestamp: number = nowSeconds()) {
  const ts = String(timestamp);
  return {
    "content-type": "application/json",
    "x-webhook-timestamp": ts,
    "x-webhook-signature": signPayload(SECRET, ts, body),
  };
}

const validBody = JSON.stringify({
  id: "evt-00000001",
  type: "deposit.completed",
  providerRef: "ref-1",
});

beforeAll(async () => {
  app = await buildApp(env, {
    ...makeFakeDeps(),
    webhookSecrets: { sandbox: SECRET },
    webhooks: {
      handle: async (provider, event) => {
        events.push({ provider, event });
        return outcome;
      },
    },
  });
});
afterAll(async () => {
  await app.close();
});
beforeEach(() => {
  events = [];
  outcome = "processed";
});

describe("POST /webhooks/:provider", () => {
  it("404 para provedor sem segredo configurado", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/desconhecido",
      headers: signed(validBody),
      payload: validBody,
    });
    expect(res.statusCode).toBe(404);
  });

  it("401 sem assinatura", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/sandbox",
      headers: { "content-type": "application/json" },
      payload: validBody,
    });
    expect(res.statusCode).toBe(401);
    expect(events).toHaveLength(0);
  });

  it("401 com assinatura inválida", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/sandbox",
      headers: {
        "content-type": "application/json",
        "x-webhook-timestamp": String(nowSeconds()),
        "x-webhook-signature": "0".repeat(64),
      },
      payload: validBody,
    });
    expect(res.statusCode).toBe(401);
    expect(events).toHaveLength(0);
  });

  it("401 com timestamp antigo, mesmo com assinatura correta", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/sandbox",
      headers: signed(validBody, nowSeconds() - 3600),
      payload: validBody,
    });
    expect(res.statusCode).toBe(401);
    expect(events).toHaveLength(0);
  });

  it("400 com JSON inválido (assinado)", async () => {
    const garbage = "isto nao e json";
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/sandbox",
      headers: signed(garbage),
      payload: garbage,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_body");
  });

  it("400 com tipo de evento desconhecido (assinado)", async () => {
    const body = JSON.stringify({ id: "evt-00000002", type: "algo.estranho", providerRef: "ref-1" });
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/sandbox",
      headers: signed(body),
      payload: body,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_event");
    expect(events).toHaveLength(0);
  });

  it("200 e repassa o evento ao serviço", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/sandbox",
      headers: signed(validBody),
      payload: validBody,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "processed" });
    expect(events).toEqual([
      {
        provider: "sandbox",
        event: {
          id: "evt-00000001",
          type: "deposit.completed",
          providerRef: "ref-1",
          data: {},
        },
      },
    ]);
  });

  it("200 também para eventos duplicados (o provedor não deve voltar a tentar)", async () => {
    outcome = "duplicate";
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/sandbox",
      headers: signed(validBody),
      payload: validBody,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "duplicate" });
  });
});

describe("configuração dos webhooks", () => {
  it("rejeita WEBHOOK_SECRET_SANDBOX com menos de 32 caracteres", () => {
    expect(() => loadEnv({ ...TEST_ENV, WEBHOOK_SECRET_SANDBOX: "curto" })).toThrow();
  });

  it("rejeita WEBHOOK_SECRET_SANDBOX em produção", () => {
    expect(() =>
      loadEnv({ ...TEST_ENV, NODE_ENV: "production", WEBHOOK_SECRET_SANDBOX: SECRET }),
    ).toThrow();
  });

  it("trata WEBHOOK_SECRET_SANDBOX vazio como não definido", () => {
    expect(loadEnv({ ...TEST_ENV, WEBHOOK_SECRET_SANDBOX: "" }).WEBHOOK_SECRET_SANDBOX).toBeUndefined();
  });
});
