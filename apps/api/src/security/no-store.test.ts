import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { loadEnv } from "../config/env.js";
import { TEST_ENV, VALID_TOKEN, makeFakeDeps } from "../testing/fakes.js";

type App = Awaited<ReturnType<typeof buildApp>>;

let app: App;
let broken: App;
let counter = 0;

function headers(extra: Record<string, string> = {}): Record<string, string> {
  counter += 1;
  return { "x-forwarded-for": `10.40.0.${(counter % 250) + 1}`, ...extra };
}

function auth(): Record<string, string> {
  return headers({ authorization: `Bearer ${VALID_TOKEN}` });
}

beforeAll(async () => {
  app = await buildApp(loadEnv(TEST_ENV), makeFakeDeps());

  const base = makeFakeDeps();
  broken = await buildApp(
    loadEnv(TEST_ENV),
    makeFakeDeps({
      wallet: {
        ...base.wallet,
        getOrCreateWallet: async () => {
          throw new Error("falha interna de teste");
        },
      },
    }),
  );
});

afterAll(async () => {
  await app.close();
  await broken.close();
});

describe("Cache-Control: no-store em todas as respostas", () => {
  it("rotas públicas", async () => {
    for (const url of ["/health", "/public/support"]) {
      const res = await app.inject({ method: "GET", url, headers: headers() });
      expect(res.statusCode, url).toBe(200);
      expect(res.headers["cache-control"], url).toBe("no-store");
    }
  });

  it("respostas autenticadas com saldos, movimentos e dados pessoais", async () => {
    for (const url of ["/v1/wallet", "/v1/wallet/statement", "/v1/profile"]) {
      const res = await app.inject({ method: "GET", url, headers: auth() });
      expect(res.statusCode, url).toBe(200);
      expect(res.headers["cache-control"], url).toBe("no-store");
    }
  });

  it("uma operação de dinheiro concluída", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/transfers",
      headers: { ...auth(), "idempotency-key": "chave-no-store-0001" },
      payload: { toPhone: "+245955000002", amount: 1000 },
    });

    expect(res.statusCode).toBe(201);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("erros: sem sessão (401) e rota que não existe (404)", async () => {
    const unauthorized = await app.inject({ method: "GET", url: "/v1/wallet", headers: headers() });
    const notFound = await app.inject({ method: "GET", url: "/v1/nao-existe", headers: auth() });

    expect(unauthorized.statusCode).toBe(401);
    expect(unauthorized.headers["cache-control"]).toBe("no-store");
    expect(notFound.statusCode).toBe(404);
    expect(notFound.headers["cache-control"]).toBe("no-store");
  });

  it("erro interno (500)", async () => {
    const res = await broken.inject({ method: "GET", url: "/v1/wallet", headers: auth() });

    expect(res.statusCode).toBe(500);
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});
