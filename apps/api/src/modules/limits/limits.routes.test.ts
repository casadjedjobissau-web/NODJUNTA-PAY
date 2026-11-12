import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { loadEnv } from "../../config/env.js";
import { TEST_ENV, VALID_TOKEN, makeFakeDeps } from "../../testing/fakes.js";

const env = loadEnv(TEST_ENV);
const auth = { authorization: `Bearer ${VALID_TOKEN}` };

let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp(env, makeFakeDeps());
});
afterAll(async () => {
  await app.close();
});

describe("GET /v1/limits", () => {
  it("401 sem token", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/limits" });
    expect(res.statusCode).toBe(401);
  });

  it("200 devolve nível de KYC, moeda e as três operações", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/limits", headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json().kycLevel).toBe(0);
    expect(res.json().currency).toBe("XOF");
    expect(res.json().operations).toHaveLength(3);
  });

  it("200 mostra o levantamento como não permitido no nível 0", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/limits", headers: auth });
    const withdrawal = res
      .json()
      .operations.find((op: { operation: string }) => op.operation === "withdrawal");
    expect(withdrawal.allowed).toBe(false);
    expect(withdrawal.perTransaction).toBeNull();
  });
});
