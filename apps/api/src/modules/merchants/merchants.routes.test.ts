import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { loadEnv } from "../../config/env.js";
import { TEST_ENV, TEST_USER, VALID_TOKEN, makeFakeDeps } from "../../testing/fakes.js";
import type { MerchantView } from "./merchants.types.js";

const env = loadEnv(TEST_ENV);
const auth = { authorization: `Bearer ${VALID_TOKEN}` };

let app: Awaited<ReturnType<typeof buildApp>>;
let current: MerchantView | null = null;
let registered: { userId: string; businessName: string } | null = null;

beforeAll(async () => {
  app = await buildApp(
    env,
    makeFakeDeps({
      merchants: {
        register: async (userId, businessName) => {
          registered = { userId, businessName };
          return { merchantCode: "AB12CD34", businessName, status: "pending" };
        },
        getByOwner: async () => current,
      },
    }),
  );
});
afterAll(async () => {
  await app.close();
});
beforeEach(() => {
  current = null;
  registered = null;
});

describe("/v1/merchants", () => {
  it("POST 401 sem token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/merchants",
      payload: { businessName: "Loja da Maria" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST 400 com nome demasiado curto", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/merchants",
      headers: auth,
      payload: { businessName: "A" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST 400 ao tentar definir o estado (campo não permitido)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/merchants",
      headers: auth,
      payload: { businessName: "Loja da Maria", status: "active" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_body");
  });

  it("POST 200 regista o comerciante como pendente", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/merchants",
      headers: auth,
      payload: { businessName: "  Loja da Maria " },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("pending");
    expect(registered).toEqual({ userId: TEST_USER.id, businessName: "Loja da Maria" });
  });

  it("GET /me devolve 404 quando ainda não é comerciante", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/merchants/me", headers: auth });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("merchant_not_found");
  });

  it("GET /me/qr devolve 409 enquanto o comerciante está pendente", async () => {
    current = { merchantCode: "AB12CD34", businessName: "Loja da Maria", status: "pending" };
    const res = await app.inject({ method: "GET", url: "/v1/merchants/me/qr", headers: auth });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("merchant_not_active");
  });

  it("GET /me/qr devolve o payload quando o comerciante está ativo", async () => {
    current = { merchantCode: "AB12CD34", businessName: "Loja da Maria", status: "active" };
    const res = await app.inject({ method: "GET", url: "/v1/merchants/me/qr", headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ merchantCode: "AB12CD34", payload: "NJP1:AB12CD34" });
  });
});
