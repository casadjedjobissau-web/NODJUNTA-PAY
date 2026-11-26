import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { loadEnv } from "../config/env.js";
import type { PinService, PinVerifyResult } from "../modules/pin/pin.types.js";
import type { Authenticator } from "../plugins/auth.js";
import { ADMIN_IDS, makeFakeAdmin } from "../testing/admin-fakes.js";
import { TEST_ENV, VALID_TOKEN, makeFakeDeps } from "../testing/fakes.js";
import { documentedRoutes, loadDocument, normalizeFastifyUrl } from "../testing/openapi.js";

type App = Awaited<ReturnType<typeof buildApp>>;

const TOKENS = {
  customerAal1: "tk-cliente-aal1",
  customerAal2: "tk-cliente-aal2",
  adminAal1: "tk-admin-aal1",
  adminAal2: "tk-admin-aal2",
} as const;

const authenticator: Authenticator = async (token) => {
  switch (token) {
    case TOKENS.customerAal1:
      return { id: ADMIN_IDS.user, phone: null, aal: "aal1" };
    case TOKENS.customerAal2:
      return { id: ADMIN_IDS.user, phone: null, aal: "aal2" };
    case TOKENS.adminAal1:
      return { id: ADMIN_IDS.admin, phone: null, aal: "aal1" };
    case TOKENS.adminAal2:
      return { id: ADMIN_IDS.admin, phone: null, aal: "aal2" };
    default:
      return null;
  }
};

const WEBHOOK_SECRET = "segredo-do-webhook-que-nunca-pode-aparecer-12345";
const PARAM = "00000000-0000-4000-8000-000000000001";
const PUBLIC_ROUTES = new Set(["GET /health", "GET /public/support", "POST /webhooks/{provider}"]);

let counter = 0;
function ip(): Record<string, string> {
  counter += 1;
  return { "x-forwarded-for": `10.20.${Math.floor(counter / 250)}.${(counter % 250) + 1}` };
}

function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

function errorCode(body: string): string | null {
  try {
    const value: unknown = JSON.parse(body);
    if (typeof value === "object" && value !== null) {
      const code = (value as { error?: unknown }).error;
      return typeof code === "string" ? code : null;
    }
    return null;
  } catch {
    return null;
  }
}

async function send(app: App, route: string, headers: Record<string, string> = {}) {
  const [method = "GET", path = ""] = route.split(" ");
  const url = path.replace(/\{[^}]+\}/g, PARAM);
  const hasBody = method === "POST" || method === "PATCH";
  return app.inject({
    method: method as "GET" | "POST" | "PATCH" | "DELETE",
    url,
    headers: { ...ip(), ...headers },
    ...(hasBody ? { payload: {} } : {}),
  });
}

async function problemsFor(
  app: App,
  routes: string[],
  headers: Record<string, string>,
  status: number,
  code: string,
): Promise<string[]> {
  const problems: string[] = [];
  for (const route of routes) {
    const res = await send(app, route, headers);
    const got = errorCode(res.body);
    if (res.statusCode !== status || got !== code) {
      problems.push(`${route}: esperava ${status} ${code}, obtido ${res.statusCode} ${got ?? "(sem código)"}`);
    }
  }
  return problems;
}

const observed = new Set<string>();
const extraApps: App[] = [];
let app: App;

function customerPrivate(): string[] {
  return [...observed]
    .filter((route) => !route.split(" ")[1]?.startsWith("/admin/v1") && !PUBLIC_ROUTES.has(route))
    .sort();
}

function adminRoutes(): string[] {
  return [...observed].filter((route) => route.split(" ")[1]?.startsWith("/admin/v1")).sort();
}

async function extraApp(overrides: Parameters<typeof makeFakeDeps>[0] = {}, env = loadEnv(TEST_ENV)): Promise<App> {
  const built = await buildApp(env, makeFakeDeps(overrides));
  extraApps.push(built);
  return built;
}

beforeAll(async () => {
  app = await buildApp(
    loadEnv({ ...TEST_ENV, SANDBOX_ENABLED: "true" }),
    makeFakeDeps({
      authenticator,
      admin: makeFakeAdmin(),
      adminMfaRequired: true,
      // Serviços vazios: se uma rota sem sessão chegasse a um deles, daria erro 500 e o teste falharia.
      webhooks: {} as never,
      webhookSecrets: { sandbox: WEBHOOK_SECRET },
      pin: {} as never,
      notifications: {} as never,
      receipts: {} as never,
      support: {} as never,
      supportAdmin: {} as never,
      reports: {} as never,
      account: {} as never,
      phoneChange: {} as never,
      fraud: {} as never,
      fraudAdmin: {} as never,
      routeObserver: (route) => {
        if (route.method === "HEAD" || route.method === "OPTIONS") {
          return;
        }
        observed.add(`${route.method} ${normalizeFastifyUrl(route.url)}`);
      },
    }),
  );
});

afterAll(async () => {
  await app.close();
  for (const built of extraApps) {
    await built.close();
  }
});

describe("cobertura", () => {
  it("as rotas percorridas são exatamente as documentadas nos dois ficheiros OpenAPI", () => {
    const documented = [
      ...documentedRoutes(loadDocument("openapi.yaml")),
      ...documentedRoutes(loadDocument("openapi-admin.yaml")),
    ].sort();

    expect([...observed].sort()).toEqual(documented);
    expect(documented).toHaveLength(62);
    expect(customerPrivate()).toHaveLength(36);
    expect(adminRoutes()).toHaveLength(23);
  });
});

describe("clientes: sem sessão não abre nada", () => {
  it("sem token, todas as rotas privadas respondem 401", async () => {
    expect(await problemsFor(app, customerPrivate(), {}, 401, "unauthorized")).toEqual([]);
  });

  it("com um token inválido, todas as rotas privadas respondem 401", async () => {
    expect(await problemsFor(app, customerPrivate(), bearer("token-inventado"), 401, "unauthorized")).toEqual([]);
  });

  it("um token válido no endereço, o esquema Basic e um token vazio não valem", async () => {
    const inUrl = await app.inject({
      method: "GET",
      url: `/v1/wallet?access_token=${TOKENS.customerAal1}`,
      headers: ip(),
    });
    const basic = await app.inject({
      method: "GET",
      url: "/v1/wallet",
      headers: { ...ip(), authorization: "Basic dXN1YXJpbzpwYXNz" },
    });
    const empty = await app.inject({
      method: "GET",
      url: "/v1/wallet",
      headers: { ...ip(), authorization: "Bearer " },
    });

    expect(inUrl.statusCode).toBe(401);
    expect(basic.statusCode).toBe(401);
    expect(empty.statusCode).toBe(401);
  });
});

describe("administração: três camadas", () => {
  it("sem token, todas as rotas respondem 401", async () => {
    expect(await problemsFor(app, adminRoutes(), {}, 401, "unauthorized")).toEqual([]);
  });

  it("um administrador sem o segundo fator recebe mfa_required em todas as rotas", async () => {
    expect(await problemsFor(app, adminRoutes(), bearer(TOKENS.adminAal1), 403, "mfa_required")).toEqual([]);
  });

  it("um cliente sem o segundo fator recebe também mfa_required, sem revelar se a conta é de administração", async () => {
    expect(await problemsFor(app, adminRoutes(), bearer(TOKENS.customerAal1), 403, "mfa_required")).toEqual([]);
  });

  it("um cliente com o segundo fator recebe forbidden em todas as rotas", async () => {
    expect(await problemsFor(app, adminRoutes(), bearer(TOKENS.customerAal2), 403, "forbidden")).toEqual([]);
  });

  it("rotas que não existem respondem 404 genérico, com ou sem sessão", async () => {
    const cases: Array<[string, Record<string, string>]> = [
      ["/admin/v1/nao-existe", bearer(TOKENS.adminAal2)],
      ["/v1/nao-existe", bearer(TOKENS.customerAal2)],
      ["/nao-existe", {}],
    ];
    for (const [url, headers] of cases) {
      const res = await app.inject({ method: "GET", url, headers: { ...ip(), ...headers } });
      expect(res.statusCode, url).toBe(404);
      expect(errorCode(res.body), url).toBe("not_found");
    }
  });
});

describe("rotas públicas", () => {
  it("/health e /public/support só mostram os campos esperados", async () => {
    const health = await app.inject({ method: "GET", url: "/health", headers: ip() });
    const support = await app.inject({ method: "GET", url: "/public/support", headers: ip() });

    expect(Object.keys(health.json()).sort()).toEqual(["currency", "service", "status", "time"]);
    expect(Object.keys(support.json())).toEqual(["phones"]);
    for (const phone of support.json().phones as Array<Record<string, unknown>>) {
      expect(Object.keys(phone).sort()).toEqual(["display", "e164"]);
    }
  });

  it("um webhook sem assinatura, ou com assinatura errada, nunca chega ao serviço nem revela o segredo", async () => {
    const body = JSON.stringify({ id: "evento-seguranca-1", type: "deposit.completed", providerRef: "ref-1" });
    const base = { "content-type": "application/json" };

    const noSignature = await app.inject({
      method: "POST",
      url: "/webhooks/sandbox",
      headers: { ...base, ...ip() },
      payload: body,
    });
    const wrongSignature = await app.inject({
      method: "POST",
      url: "/webhooks/sandbox",
      headers: {
        ...base,
        ...ip(),
        "x-webhook-timestamp": String(Math.floor(Date.now() / 1000)),
        "x-webhook-signature": "0".repeat(64),
      },
      payload: body,
    });

    expect(noSignature.statusCode).toBeGreaterThanOrEqual(400);
    expect(noSignature.statusCode).toBeLessThan(500);
    expect(wrongSignature.statusCode).toBe(401);
    expect(noSignature.body + wrongSignature.body).not.toContain(WEBHOOK_SECRET);
  });

  it("com o sandbox desligado, a rota de simulação não existe", async () => {
    const closed = await extraApp();

    const res = await closed.inject({
      method: "POST",
      url: `/v1/sandbox/funding-requests/${PARAM}/complete`,
      headers: { ...ip(), ...bearer(VALID_TOKEN) },
      payload: {},
    });

    expect(res.statusCode).toBe(404);
    expect(errorCode(res.body)).toBe("not_found");
  });
});

describe("o PIN nunca volta ao cliente", () => {
  const PIN = "482913";
  let verifyResult: PinVerifyResult = { ok: true };

  const pinService: PinService = {
    status: async () => ({ hasPin: true, locked: false, lockedUntil: null }),
    setInitial: async () => undefined,
    verify: async () => verifyResult,
    change: async () => ({ ok: true }),
    reset: async () => undefined,
  };

  const BODIES: ReadonlyArray<[string, Record<string, unknown>]> = [
    ["/v1/transfers", { toPhone: "+245955000002", amount: 1000 }],
    ["/v1/payments/merchant", { merchantCode: "AB12CD34", amount: 1500 }],
    ["/v1/withdrawals", { amount: 2000, destination: "+245955000099" }],
  ];

  const RESULTS: ReadonlyArray<[string, PinVerifyResult]> = [
    ["certo", { ok: true }],
    ["errado", { ok: false, reason: "invalid", attemptsLeft: 2, lockedUntil: null }],
    ["bloqueado", { ok: false, reason: "locked", lockedUntil: "2026-11-14T10:00:00.000Z" }],
  ];

  it("nas três operações de dinheiro, com PIN certo, errado, bloqueado ou mal formado", async () => {
    const pinApp = await extraApp({ pin: pinService });

    for (const [url, payload] of BODIES) {
      for (const [label, result] of RESULTS) {
        verifyResult = result;
        const res = await pinApp.inject({
          method: "POST",
          url,
          headers: { ...ip(), ...bearer(VALID_TOKEN), "x-pin": PIN, "idempotency-key": "chave-seguranca-0001" },
          payload,
        });
        expect(res.body, `${url} (${label}) corpo`).not.toContain(PIN);
        expect(JSON.stringify(res.headers), `${url} (${label}) cabeçalhos`).not.toContain(PIN);
      }

      const malformed = await pinApp.inject({
        method: "POST",
        url,
        headers: { ...ip(), ...bearer(VALID_TOKEN), "x-pin": "12345a", "idempotency-key": "chave-seguranca-0002" },
        payload,
      });
      expect(malformed.body, `${url} (mal formado)`).not.toContain("12345a");
    }
  });

  it("ao definir e ao alterar o PIN, a resposta não repete nenhum dos PIN", async () => {
    verifyResult = { ok: true };
    const pinApp = await extraApp({ pin: pinService });

    const set = await pinApp.inject({
      method: "POST",
      url: "/v1/pin",
      headers: { ...ip(), ...bearer(VALID_TOKEN) },
      payload: { pin: PIN },
    });
    const change = await pinApp.inject({
      method: "POST",
      url: "/v1/pin/change",
      headers: { ...ip(), ...bearer(VALID_TOKEN) },
      payload: { currentPin: PIN, newPin: "135790" },
    });

    for (const res of [set, change]) {
      expect(res.statusCode).toBeLessThan(500);
      expect(res.body).not.toContain(PIN);
      expect(res.body).not.toContain("135790");
      expect(JSON.stringify(res.headers)).not.toContain(PIN);
    }
  });
});

describe("cabeçalhos, CORS, erros e limites", () => {
  it("as respostas levam os cabeçalhos de segurança do Helmet e não anunciam a tecnologia", async () => {
    const res = await app.inject({ method: "GET", url: "/health", headers: ip() });

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeDefined();
    expect(res.headers["strict-transport-security"]).toBeDefined();
    expect(res.headers["content-security-policy"]).toBeDefined();
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("por omissão o CORS está fechado: nenhuma origem é autorizada", async () => {
    const closed = await extraApp();

    const simple = await closed.inject({
      method: "GET",
      url: "/health",
      headers: { ...ip(), origin: "https://evil.example" },
    });
    const preflight = await closed.inject({
      method: "OPTIONS",
      url: "/v1/wallet",
      headers: { ...ip(), origin: "https://evil.example", "access-control-request-method": "GET" },
    });

    expect(simple.headers["access-control-allow-origin"]).toBeUndefined();
    expect(preflight.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("com uma lista de origens, só essas são autorizadas, e nunca '*'", async () => {
    const open = await extraApp({}, loadEnv({ ...TEST_ENV, CORS_ORIGINS: "https://painel.exemplo.local" }));

    const allowed = await open.inject({
      method: "GET",
      url: "/health",
      headers: { ...ip(), origin: "https://painel.exemplo.local" },
    });
    const denied = await open.inject({
      method: "GET",
      url: "/health",
      headers: { ...ip(), origin: "https://evil.example" },
    });

    expect(allowed.headers["access-control-allow-origin"]).toBe("https://painel.exemplo.local");
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("um erro interno não revela detalhes, como uma ligação à base de dados com palavra-passe", async () => {
    const base = makeFakeDeps();
    const broken = await extraApp({
      wallet: {
        ...base.wallet,
        getOrCreateWallet: async () => {
          throw new Error("falhou postgres://admin:hunter2@db.interno:5432/producao");
        },
      },
    });

    const res = await broken.inject({
      method: "GET",
      url: "/v1/wallet",
      headers: { ...ip(), ...bearer(VALID_TOKEN) },
    });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: "internal_error", message: "Erro interno do servidor." });
    expect(res.body).not.toContain("hunter2");
    expect(res.body).not.toContain("postgres://");
  });

  it("um JSON inválido dá 400 sem rasto da pilha de execução", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/transfers",
      headers: { ...ip(), ...bearer(TOKENS.customerAal1), "content-type": "application/json" },
      payload: "{",
    });

    expect(res.statusCode).toBe(400);
    expect(errorCode(res.body)).toBe("request_error");
    expect(res.body).not.toContain("node_modules");
    expect(res.body).not.toMatch(/\n\s+at /);
  });

  it("um corpo com mais de 1 MiB é recusado com 413", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/transfers",
      headers: { ...ip(), ...bearer(TOKENS.customerAal1), "content-type": "application/json" },
      payload: JSON.stringify({ reference: "x".repeat(1_200_000) }),
    });

    expect(res.statusCode).toBe(413);
  });

  it("o 101.º pedido do mesmo IP no mesmo minuto é recusado com 429", async () => {
    const limited = await extraApp();
    const headers = { "x-forwarded-for": "10.77.0.1" };

    for (let index = 0; index < 100; index += 1) {
      const res = await limited.inject({ method: "GET", url: "/health", headers });
      expect(res.statusCode, `pedido ${index + 1}`).toBe(200);
    }
    const blocked = await limited.inject({ method: "GET", url: "/health", headers });

    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers["retry-after"]).toBeDefined();
  });
});
