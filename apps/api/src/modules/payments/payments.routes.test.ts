import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { loadEnv } from "../../config/env.js";
import { TEST_ENV, TEST_USER, VALID_TOKEN, makeFakeDeps } from "../../testing/fakes.js";
import {
  PaymentError,
  type MerchantPaymentInput,
  type MerchantPaymentResult,
} from "./payments.types.js";

const env = loadEnv(TEST_ENV);
const auth = { authorization: `Bearer ${VALID_TOKEN}` };
const headers = { ...auth, "idempotency-key": "pagamento-teste-0001" };
const validBody = { merchantCode: "AB12CD34", amount: 1500, reference: "pão" };

let app: Awaited<ReturnType<typeof buildApp>>;
let calls: MerchantPaymentInput[] = [];
let next: () => Promise<MerchantPaymentResult>;

function okResult(replayed: boolean): MerchantPaymentResult {
  return {
    transactionId: "99999999-9999-4999-8999-999999999999",
    replayed,
    amount: 1500,
    currency: "XOF",
    merchantCode: "AB12CD34",
    businessName: "Loja Teste",
  };
}

beforeAll(async () => {
  const base = makeFakeDeps();
  app = await buildApp(
    env,
    makeFakeDeps({
      payments: {
        resolveQr: base.payments.resolveQr,
        payMerchant: async (input) => {
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

describe("POST /v1/payments/qr/resolve", () => {
  it("401 sem token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/payments/qr/resolve",
      payload: { payload: "NJP1:AB12CD34" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("404 para QR inválido", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/payments/qr/resolve",
      headers: auth,
      payload: { payload: "NJP1:00000000" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("merchant_not_found");
  });

  it("200 devolve os dados do comerciante", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/payments/qr/resolve",
      headers: auth,
      payload: { payload: "NJP1:AB12CD34" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ merchantCode: "AB12CD34", businessName: "Loja Teste" });
  });
});

describe("POST /v1/payments/merchant", () => {
  it("400 sem Idempotency-Key", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/payments/merchant",
      headers: auth,
      payload: validBody,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_idempotency_key");
  });

  it("400 com merchantCode em minúsculas", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/payments/merchant",
      headers,
      payload: { ...validBody, merchantCode: "ab12cd34" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("201 em sucesso e repassa os dados ao serviço", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/payments/merchant",
      headers,
      payload: validBody,
    });
    expect(res.statusCode).toBe(201);
    expect(calls).toEqual([
      {
        fromUserId: TEST_USER.id,
        merchantCode: "AB12CD34",
        amount: 1500,
        idempotencyKey: "pagamento-teste-0001",
        reference: "pão",
      },
    ]);
  });

  it("200 quando é repetição idempotente", async () => {
    next = async () => okResult(true);
    const res = await app.inject({
      method: "POST",
      url: "/v1/payments/merchant",
      headers,
      payload: validBody,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().replayed).toBe(true);
  });

  it("422 quando o saldo é insuficiente", async () => {
    next = async () => {
      throw new PaymentError("insufficient_funds", 422, "Saldo insuficiente.");
    };
    const res = await app.inject({
      method: "POST",
      url: "/v1/payments/merchant",
      headers,
      payload: validBody,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe("insufficient_funds");
  });
});
