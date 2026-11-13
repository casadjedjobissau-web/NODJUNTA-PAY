import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { TEST_ENV, makeFakeDeps } from "./testing/fakes.js";

const env = loadEnv(TEST_ENV);
const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

async function makeApp(supportPhones?: string[]) {
  const app = await buildApp(env, makeFakeDeps(supportPhones ? { supportPhones } : {}));
  apps.push(app);
  return app;
}

afterAll(async () => {
  for (const app of apps) {
    await app.close();
  }
});

describe("GET /public/support", () => {
  it("devolve os números de suporte formatados, sem precisar de token", async () => {
    const app = await makeApp(["+245956191968", "+245956656700"]);
    const res = await app.inject({ method: "GET", url: "/public/support" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      phones: [
        { e164: "+245956191968", display: "+245 956 191 968" },
        { e164: "+245956656700", display: "+245 956 656 700" },
      ],
    });
  });

  it("devolve uma lista vazia quando não há números configurados", async () => {
    const app = await makeApp();
    const res = await app.inject({ method: "GET", url: "/public/support" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ phones: [] });
  });

  it("mantém um número noutro formato como foi configurado", async () => {
    const app = await makeApp(["+351912345678"]);
    const res = await app.inject({ method: "GET", url: "/public/support" });
    expect(res.json()).toEqual({ phones: [{ e164: "+351912345678", display: "+351912345678" }] });
  });
});
