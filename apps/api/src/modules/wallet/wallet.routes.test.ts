import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { loadEnv } from "../../config/env.js";
import { TEST_ENV, VALID_TOKEN, makeFakeDeps } from "../../testing/fakes.js";
import type { StatementOptions } from "./wallet.types.js";

const env = loadEnv(TEST_ENV);
const auth = { authorization: `Bearer ${VALID_TOKEN}` };

let app: Awaited<ReturnType<typeof buildApp>>;
let lastOptions: StatementOptions | null = null;

beforeAll(async () => {
  const base = makeFakeDeps();
  app = await buildApp(
    env,
    makeFakeDeps({
      wallet: {
        getOrCreateWallet: base.wallet.getOrCreateWallet,
        getStatement: async (userId, options) => {
          lastOptions = options;
          return base.wallet.getStatement(userId, options);
        },
      },
    }),
  );
});
afterAll(async () => {
  await app.close();
});

describe("GET /v1/wallet", () => {
  it("401 sem cabeçalho Authorization", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/wallet" });
    expect(res.statusCode).toBe(401);
  });

  it("401 com token inválido", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/wallet",
      headers: { authorization: "Bearer token-errado" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("200 com token válido", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/wallet", headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json().balance).toBe(6000);
    expect(res.json().currency).toBe("XOF");
  });
});

describe("GET /v1/wallet/statement", () => {
  it("400 com limit inválido", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/wallet/statement?limit=0",
      headers: auth,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_query");
  });

  it("200 e repassa limit e before ao serviço", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/wallet/statement?limit=5&before=50",
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toHaveLength(1);
    expect(lastOptions).toEqual({ limit: 5, before: 50 });
  });
});
