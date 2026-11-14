import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { loadEnv } from "../../config/env.js";
import { TEST_ENV, TEST_USER, VALID_TOKEN, makeFakeDeps } from "../../testing/fakes.js";
import { ReceiptError, type ReceiptService, type ReceiptView } from "./receipts.types.js";

const env = loadEnv(TEST_ENV);
const auth = { authorization: `Bearer ${VALID_TOKEN}` };
const TX = "33333333-3333-4333-8333-333333333333";

const RECEIPT: ReceiptView = {
  receiptNumber: "NP-261114-000123",
  transactionId: TX,
  kind: "transfer",
  direction: "out",
  amount: 4000,
  fee: 100,
  total: 4100,
  currency: "XOF",
  counterparty: { label: "Bruno Sá", detail: "+245 955 *** 302" },
  reference: "almoço",
  occurredAt: "2026-11-14T10:00:00.000Z",
  issuedAt: "2026-11-14T10:00:05.000Z",
};

let app: Awaited<ReturnType<typeof buildApp>>;
let appWithout: Awaited<ReturnType<typeof buildApp>>;
let calls: Array<{ userId: string; transactionId: string }> = [];
let failure: Error | null = null;

const service: ReceiptService = {
  get: async (userId, transactionId) => {
    calls.push({ userId, transactionId });
    if (failure) {
      throw failure;
    }
    return RECEIPT;
  },
};

beforeAll(async () => {
  app = await buildApp(env, makeFakeDeps({ receipts: service }));
  appWithout = await buildApp(env, makeFakeDeps());
});
afterAll(async () => {
  await app.close();
  await appWithout.close();
});
beforeEach(() => {
  calls = [];
  failure = null;
});

describe("GET /v1/receipts/:transactionId", () => {
  it("401 sem token", async () => {
    const res = await app.inject({ method: "GET", url: `/v1/receipts/${TX}` });
    expect(res.statusCode).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("400 com identificador que não é UUID", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/receipts/nao-e-uuid", headers: auth });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_params");
    expect(calls).toHaveLength(0);
  });

  it("200 devolve o recibo do utilizador autenticado", async () => {
    const res = await app.inject({ method: "GET", url: `/v1/receipts/${TX}`, headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(RECEIPT);
    expect(calls).toEqual([{ userId: TEST_USER.id, transactionId: TX }]);
  });

  it("404 quando não há recibo para a operação", async () => {
    failure = new ReceiptError("receipt_not_available", 404, "Não há recibo para esta operação.");
    const res = await app.inject({ method: "GET", url: `/v1/receipts/${TX}`, headers: auth });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("receipt_not_available");
  });

  it("sem serviço de recibos a rota não existe", async () => {
    const res = await appWithout.inject({ method: "GET", url: `/v1/receipts/${TX}`, headers: auth });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("not_found");
  });
});
