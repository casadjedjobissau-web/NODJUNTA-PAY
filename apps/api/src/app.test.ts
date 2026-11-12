import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { TEST_ENV, makeFakeDeps } from "./testing/fakes.js";

const env = loadEnv(TEST_ENV);
let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp(env, makeFakeDeps());
});
afterAll(async () => {
  await app.close();
});

describe("API base", () => {
  it("GET /health devolve 200 e status ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("ok");
  });

  it("rota inexistente devolve 404 em JSON", async () => {
    const res = await app.inject({ method: "GET", url: "/nao-existe" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("not_found");
  });

  it("rejeita moeda inválida na configuração", () => {
    expect(() => loadEnv({ ...TEST_ENV, DEFAULT_CURRENCY: "xx" })).toThrow();
  });

  it("rejeita configuração sem SUPABASE_URL", () => {
    const { SUPABASE_URL: _omitted, ...rest } = TEST_ENV;
    expect(() => loadEnv(rest)).toThrow();
  });

  it("SANDBOX_ENABLED é false por omissão", () => {
    expect(loadEnv(TEST_ENV).SANDBOX_ENABLED).toBe(false);
  });

  it("recusa SANDBOX_ENABLED=true em produção", () => {
    expect(() =>
      loadEnv({ ...TEST_ENV, NODE_ENV: "production", SANDBOX_ENABLED: "true" }),
    ).toThrow();
  });
});
