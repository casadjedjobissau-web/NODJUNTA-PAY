import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { loadEnv } from "../../config/env.js";
import { TEST_ENV, TEST_USER, VALID_TOKEN, makeFakeDeps } from "../../testing/fakes.js";
import { TransferError, type TransferInput, type TransferResult } from "./transfers.types.js";

const env = loadEnv(TEST_ENV);
const headers = {
  authorization: `Bearer ${VALID_TOKEN}`,
  "idempotency-key": "chave-de-teste-0001",
};
const validBody = { toPhone: "+245955000002", amount: 2500, reference: "almoço" };

let app: Awaited<ReturnType<typeof buildApp>>;
let calls: TransferInput[] = [];
let next: () => Promise<TransferResult>;

function okResult(replayed: boolean): TransferResult {
  return {
    transactionId: "55555555-5555-4555-8555-555555555555",
    replayed,
    amount: 2500,
    currency: "XOF",
    toPhone: "+245955000002",
  };
}

beforeAll(async () => {
  app = await buildApp(
    env,
    makeFakeDeps({
      transfers: {
        createTransfer: async (input) => {
          calls.push(input);
          return next();
        },
      },
    }),
  );
});
afterAll(async () => {
  await app.close();
});
beforeEach(() => {
  calls = [];
  next = async () => okResult(false);
});

describe("POST /v1/transfers", () => {
  it("401 sem token", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/transfers", payload: validBody });
    expect(res.statusCode).toBe(401);
  });

  it("400 sem Idempotency-Key", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/transfers",
      headers: { authorization: headers.authorization },
      payload: validBody,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_idempotency_key");
  });

  it("400 com telefone inválido", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/transfers",
      headers,
      payload: { ...validBody, toPhone: "955000002" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_body");
  });

  it("400 com valor não inteiro", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/transfers",
      headers,
      payload: { ...validBody, amount: 10.5 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("400 com valor zero", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/transfers",
      headers,
      payload: { ...validBody, amount: 0 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("201 em sucesso e repassa os dados ao serviço", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/transfers",
      headers,
      payload: validBody,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().transactionId).toBe("55555555-5555-4555-8555-555555555555");
    expect(calls).toEqual([
      {
        fromUserId: TEST_USER.id,
        toPhone: "+245955000002",
        amount: 2500,
        idempotencyKey: "chave-de-teste-0001",
        reference: "almoço",
      },
    ]);
  });

  it("200 quando é repetição idempotente", async () => {
    next = async () => okResult(true);
    const res = await app.inject({
      method: "POST",
      url: "/v1/transfers",
      headers,
      payload: validBody,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().replayed).toBe(true);
  });

  it("422 quando o saldo é insuficiente", async () => {
    next = async () => {
      throw new TransferError("insufficient_funds", 422, "Saldo insuficiente.");
    };
    const res = await app.inject({
      method: "POST",
      url: "/v1/transfers",
      headers,
      payload: validBody,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe("insufficient_funds");
  });
});
