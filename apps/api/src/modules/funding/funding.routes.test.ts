import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { loadEnv } from "../../config/env.js";
import {
  TEST_ENV,
  TEST_USER,
  VALID_TOKEN,
  makeFakeDeps,
  makeFundingView,
} from "../../testing/fakes.js";
import { FundingError, type FundingResult, type SandboxOutcome } from "./funding.types.js";

const auth = { authorization: `Bearer ${VALID_TOKEN}` };
const headers = { ...auth, "idempotency-key": "fundos-teste-0001" };
const REQUEST_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

let appOn: Awaited<ReturnType<typeof buildApp>>;
let appOff: Awaited<ReturnType<typeof buildApp>>;
let depositCalls: Array<{ userId: string; amount: number }> = [];
let sandboxCalls: Array<{ requestId: string; outcome: SandboxOutcome }> = [];
let next: () => Promise<FundingResult>;

function deps() {
  return makeFakeDeps({
    funding: {
      createDeposit: async (userId, amount) => {
        depositCalls.push({ userId, amount });
        return next();
      },
      createWithdrawal: async () => next(),
      list: async () => [makeFundingView()],
      sandboxSettle: async (_userId, requestId, outcome) => {
        sandboxCalls.push({ requestId, outcome });
        return makeFundingView({ status: outcome === "complete" ? "completed" : "failed" });
      },
    },
  });
}

beforeAll(async () => {
  appOn = await buildApp(loadEnv({ ...TEST_ENV, SANDBOX_ENABLED: "true" }), deps());
  appOff = await buildApp(loadEnv(TEST_ENV), deps());
});
afterAll(async () => {
  await appOn.close();
  await appOff.close();
});
beforeEach(() => {
  depositCalls = [];
  sandboxCalls = [];
  next = async () => ({ request: makeFundingView(), replayed: false });
});

describe("POST /v1/deposits", () => {
  it("401 sem token", async () => {
    const res = await appOn.inject({
      method: "POST",
      url: "/v1/deposits",
      payload: { amount: 5000 },
    });
    expect(res.statusCode).toBe(401);
  });

  it("400 sem Idempotency-Key", async () => {
    const res = await appOn.inject({
      method: "POST",
      url: "/v1/deposits",
      headers: auth,
      payload: { amount: 5000 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_idempotency_key");
  });

  it("400 com valor não inteiro", async () => {
    const res = await appOn.inject({
      method: "POST",
      url: "/v1/deposits",
      headers,
      payload: { amount: 10.5 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("201 em sucesso e repassa utilizador e valor ao serviço", async () => {
    const res = await appOn.inject({
      method: "POST",
      url: "/v1/deposits",
      headers,
      payload: { amount: 5000 },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().request.status).toBe("pending");
    expect(depositCalls).toEqual([{ userId: TEST_USER.id, amount: 5000 }]);
  });
});

describe("POST /v1/withdrawals", () => {
  it("400 com destino em formato inválido", async () => {
    const res = await appOn.inject({
      method: "POST",
      url: "/v1/withdrawals",
      headers,
      payload: { amount: 2000, destination: "955000099" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_body");
  });

  it("422 quando o saldo é insuficiente", async () => {
    next = async () => {
      throw new FundingError("insufficient_funds", 422, "Saldo insuficiente.");
    };
    const res = await appOn.inject({
      method: "POST",
      url: "/v1/withdrawals",
      headers,
      payload: { amount: 2000, destination: "+245955000099" },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe("insufficient_funds");
  });
});

describe("GET /v1/funding-requests", () => {
  it("200 devolve a lista", async () => {
    const res = await appOn.inject({ method: "GET", url: "/v1/funding-requests", headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toHaveLength(1);
  });
});

describe("endpoint sandbox", () => {
  it("200 quando SANDBOX_ENABLED=true e repassa o resultado ao serviço", async () => {
    const res = await appOn.inject({
      method: "POST",
      url: `/v1/sandbox/funding-requests/${REQUEST_ID}/complete`,
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("completed");
    expect(sandboxCalls).toEqual([{ requestId: REQUEST_ID, outcome: "complete" }]);
  });

  it("404 quando SANDBOX_ENABLED=false (a rota nem existe)", async () => {
    const res = await appOff.inject({
      method: "POST",
      url: `/v1/sandbox/funding-requests/${REQUEST_ID}/complete`,
      headers: auth,
    });
    expect(res.statusCode).toBe(404);
  });
});
