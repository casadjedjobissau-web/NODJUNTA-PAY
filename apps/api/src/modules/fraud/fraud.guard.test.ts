import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp, type AppDeps } from "../../app.js";
import { loadEnv } from "../../config/env.js";
import { TEST_ENV, TEST_USER, VALID_TOKEN, makeFakeDeps } from "../../testing/fakes.js";
import type { PinService } from "../pin/pin.types.js";
import { FRAUD_OPERATIONS_BY_ROUTE, readAmount } from "./fraud.guard.js";
import type { FraudDecision, FraudOperation, FraudService } from "./fraud.types.js";

const env = loadEnv(TEST_ENV);
const PIN = "482913";

let counter = 0;
function headers(extra: Record<string, string> = {}) {
  counter += 1;
  return {
    authorization: `Bearer ${VALID_TOKEN}`,
    "x-forwarded-for": `10.5.${Math.floor(counter / 250)}.${(counter % 250) + 1}`,
    ...extra,
  };
}

let decision: FraudDecision = { decision: "allow" };
let failure: Error | null = null;
let checks: Array<{ userId: string; operation: FraudOperation; amount: number }> = [];
let events: string[] = [];
let transferCalls = 0;
let paymentCalls = 0;
let withdrawalCalls = 0;

const fraudService: FraudService = {
  check: async (userId, operation, amount) => {
    events.push("fraud:check");
    checks.push({ userId, operation, amount });
    if (failure) {
      throw failure;
    }
    return decision;
  },
};

const pinService: PinService = {
  status: async () => ({ hasPin: true, locked: false, lockedUntil: null }),
  setInitial: async () => undefined,
  verify: async () => {
    events.push("pin:verify");
    return { ok: true };
  },
  change: async () => ({ ok: true }),
  reset: async () => undefined,
};

function makeDeps(options: { fraud: boolean; pin: boolean }): AppDeps {
  const base = makeFakeDeps();
  const overrides: Partial<AppDeps> = {
    transfers: {
      createTransfer: async (input) => {
        transferCalls += 1;
        return {
          transactionId: "44444444-4444-4444-8444-444444444444",
          replayed: false,
          amount: input.amount,
          currency: "XOF",
          toPhone: input.toPhone,
        };
      },
    },
    payments: {
      resolveQr: base.payments.resolveQr,
      payMerchant: async (input) => {
        paymentCalls += 1;
        return {
          transactionId: "99999999-9999-4999-8999-999999999999",
          replayed: false,
          amount: input.amount,
          currency: "XOF",
          merchantCode: input.merchantCode,
          businessName: "Loja Teste",
        };
      },
    },
    funding: {
      ...base.funding,
      createWithdrawal: async (userId, amount, destination) => {
        withdrawalCalls += 1;
        return base.funding.createWithdrawal(userId, amount, destination, "chave-teste-0001");
      },
    },
  };
  if (options.fraud) {
    overrides.fraud = fraudService;
  }
  if (options.pin) {
    overrides.pin = pinService;
  }
  return makeFakeDeps(overrides);
}

const transferBody = { toPhone: "+245955000002", amount: 1000 };
const withdrawalBody = { amount: 2000, destination: "+245955000099" };
const paymentBody = { merchantCode: "AB12CD34", amount: 1500 };

let app: Awaited<ReturnType<typeof buildApp>>;
let appPin: Awaited<ReturnType<typeof buildApp>>;
let appWithout: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp(env, makeDeps({ fraud: true, pin: false }));
  appPin = await buildApp(env, makeDeps({ fraud: true, pin: true }));
  appWithout = await buildApp(env, makeDeps({ fraud: false, pin: false }));
});
afterAll(async () => {
  await app.close();
  await appPin.close();
  await appWithout.close();
});
beforeEach(() => {
  decision = { decision: "allow" };
  failure = null;
  checks = [];
  events = [];
  transferCalls = 0;
  paymentCalls = 0;
  withdrawalCalls = 0;
});

describe("guarda antifraude: operações avaliadas", () => {
  it("avalia uma transferência e deixa-a avançar", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/transfers",
      headers: headers({ "idempotency-key": "chave-fraude-0001" }),
      payload: transferBody,
    });
    expect(res.statusCode).toBe(201);
    expect(checks).toEqual([{ userId: TEST_USER.id, operation: "transfer", amount: 1000 }]);
    expect(transferCalls).toBe(1);
  });

  it("avalia um pagamento a comerciante com a operação merchant_payment", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/payments/merchant",
      headers: headers({ "idempotency-key": "chave-fraude-0002" }),
      payload: paymentBody,
    });
    expect(res.statusCode).toBe(201);
    expect(checks).toEqual([{ userId: TEST_USER.id, operation: "merchant_payment", amount: 1500 }]);
    expect(paymentCalls).toBe(1);
  });

  it("avalia um levantamento com a operação withdrawal", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/withdrawals",
      headers: headers({ "idempotency-key": "chave-fraude-0003" }),
      payload: withdrawalBody,
    });
    expect(res.statusCode).toBe(201);
    expect(checks).toEqual([{ userId: TEST_USER.id, operation: "withdrawal", amount: 2000 }]);
    expect(withdrawalCalls).toBe(1);
  });

  it("as rotas avaliadas são exatamente estas três", () => {
    expect(Object.keys(FRAUD_OPERATIONS_BY_ROUTE).sort()).toEqual([
      "POST /v1/payments/merchant",
      "POST /v1/transfers",
      "POST /v1/withdrawals",
    ]);
  });

  it("não avalia leituras como GET /v1/wallet", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/wallet", headers: headers() });
    expect(res.statusCode).toBe(200);
    expect(checks).toHaveLength(0);
  });

  it("não avalia operações sem dinheiro como POST /v1/devices", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/devices",
      headers: headers(),
      payload: { deviceId: "dispositivo-0001", platform: "android" },
    });
    expect(res.statusCode).toBe(200);
    expect(checks).toHaveLength(0);
  });
});

describe("guarda antifraude: decisões", () => {
  it("block por velocidade: 429, e o dinheiro não mexe", async () => {
    decision = { decision: "block", rule: "velocity" };
    const res = await app.inject({
      method: "POST",
      url: "/v1/transfers",
      headers: headers({ "idempotency-key": "chave-fraude-0004" }),
      payload: transferBody,
    });
    expect(res.statusCode).toBe(429);
    expect(res.json().error).toBe("too_many_operations");
    expect(res.json().message).toContain("minutos");
    expect(transferCalls).toBe(0);
  });

  it("block por pausa: 403, e o levantamento não é criado", async () => {
    decision = { decision: "block", rule: "cooldown" };
    const res = await app.inject({
      method: "POST",
      url: "/v1/withdrawals",
      headers: headers({ "idempotency-key": "chave-fraude-0005" }),
      payload: withdrawalBody,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("withdrawal_cooldown");
    expect(res.json().message).toContain("PIN");
    expect(withdrawalCalls).toBe(0);
  });

  it("flag: a operação passa", async () => {
    decision = { decision: "flag", rule: "large_amount" };
    const res = await app.inject({
      method: "POST",
      url: "/v1/transfers",
      headers: headers({ "idempotency-key": "chave-fraude-0006" }),
      payload: transferBody,
    });
    expect(res.statusCode).toBe(201);
    expect(transferCalls).toBe(1);
    expect(checks).toHaveLength(1);
  });

  it("falha fechada: se a verificação falhar, 503 e o dinheiro não mexe", async () => {
    failure = new Error("base de dados em baixo");
    const res = await app.inject({
      method: "POST",
      url: "/v1/transfers",
      headers: headers({ "idempotency-key": "chave-fraude-0007" }),
      payload: transferBody,
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe("fraud_check_unavailable");
    expect(res.body).not.toContain("base de dados");
    expect(transferCalls).toBe(0);
  });

  it("a resposta de um bloqueio só tem o código e a mensagem, sem revelar limiares", async () => {
    decision = { decision: "block", rule: "velocity" };
    const res = await app.inject({
      method: "POST",
      url: "/v1/transfers",
      headers: headers({ "idempotency-key": "chave-fraude-0008" }),
      payload: transferBody,
    });
    expect(Object.keys(res.json()).sort()).toEqual(["error", "message"]);
  });
});

describe("guarda antifraude: valores inválidos", () => {
  it("um valor com decimais não é avaliado: a rota recusa-o com a sua própria validação", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/transfers",
      headers: headers({ "idempotency-key": "chave-fraude-0009" }),
      payload: { ...transferBody, amount: 10.5 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_body");
    expect(checks).toHaveLength(0);
    expect(transferCalls).toBe(0);
  });

  it("sem valor, não é avaliado e a rota recusa o pedido", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/transfers",
      headers: headers({ "idempotency-key": "chave-fraude-0010" }),
      payload: { toPhone: "+245955000002" },
    });
    expect(res.statusCode).toBe(400);
    expect(checks).toHaveLength(0);
  });

  it("um valor escrito como texto não é avaliado e a rota recusa o pedido", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/transfers",
      headers: headers({ "idempotency-key": "chave-fraude-0011" }),
      payload: { ...transferBody, amount: "1000" },
    });
    expect(res.statusCode).toBe(400);
    expect(checks).toHaveLength(0);
  });

  it("readAmount só aceita inteiros positivos e seguros", () => {
    expect(readAmount({ amount: 1000 })).toBe(1000);
    for (const body of [
      { amount: 0 },
      { amount: -5 },
      { amount: 10.5 },
      { amount: "1000" },
      { amount: Number.MAX_SAFE_INTEGER + 1 },
      {},
      [],
      null,
      undefined,
      "texto",
      42,
    ]) {
      expect(readAmount(body)).toBeNull();
    }
  });
});

describe("guarda antifraude: ordem e ausência", () => {
  it("sem o serviço de antifraude, a guarda não existe", async () => {
    const res = await appWithout.inject({
      method: "POST",
      url: "/v1/transfers",
      headers: headers({ "idempotency-key": "chave-fraude-0012" }),
      payload: transferBody,
    });
    expect(res.statusCode).toBe(201);
    expect(checks).toHaveLength(0);
  });

  it("sem PIN, nem chega ao antifraude", async () => {
    const res = await appPin.inject({
      method: "POST",
      url: "/v1/transfers",
      headers: headers({ "idempotency-key": "chave-fraude-0013" }),
      payload: transferBody,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("pin_required");
    expect(checks).toHaveLength(0);
  });

  it("com PIN, o PIN é verificado primeiro e o antifraude depois", async () => {
    const res = await appPin.inject({
      method: "POST",
      url: "/v1/transfers",
      headers: headers({ "idempotency-key": "chave-fraude-0014", "x-pin": PIN }),
      payload: transferBody,
    });
    expect(res.statusCode).toBe(201);
    expect(events).toEqual(["pin:verify", "fraud:check"]);
  });

  it("sem autenticação, 401 e nada é avaliado", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/transfers",
      headers: { "idempotency-key": "chave-fraude-0015", "x-forwarded-for": "10.5.9.9" },
      payload: transferBody,
    });
    expect(res.statusCode).toBe(401);
    expect(checks).toHaveLength(0);
  });
});
