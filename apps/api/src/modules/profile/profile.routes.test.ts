import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { loadEnv } from "../../config/env.js";
import { TEST_ENV, TEST_USER, VALID_TOKEN, makeFakeDeps } from "../../testing/fakes.js";
import type { ProfilePatch } from "./profile.types.js";

const env = loadEnv(TEST_ENV);
const auth = { authorization: `Bearer ${VALID_TOKEN}` };

let app: Awaited<ReturnType<typeof buildApp>>;
let lastPatch: ProfilePatch | null = null;

beforeAll(async () => {
  const base = makeFakeDeps();
  app = await buildApp(
    env,
    makeFakeDeps({
      profile: {
        getOrCreate: base.profile.getOrCreate,
        update: async (userId, patch) => {
          lastPatch = patch;
          return base.profile.update(userId, patch);
        },
      },
    }),
  );
});
afterAll(async () => {
  await app.close();
});

describe("/v1/profile", () => {
  it("401 sem token", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/profile" });
    expect(res.statusCode).toBe(401);
  });

  it("GET 200 devolve o perfil com kycLevel 0", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/profile", headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json().userId).toBe(TEST_USER.id);
    expect(res.json().kycLevel).toBe(0);
  });

  it("PATCH 400 com corpo vazio", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/profile",
      headers: auth,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("PATCH 400 ao tentar alterar kycLevel (campo não permitido)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/profile",
      headers: auth,
      payload: { fullName: "Maria Gomes", kycLevel: 3 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_body");
  });

  it("PATCH 400 com idioma inválido", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/profile",
      headers: auth,
      payload: { language: "fr" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("PATCH 200 repassa fullName e language ao serviço", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/profile",
      headers: auth,
      payload: { fullName: "  Maria Gomes ", language: "kri" },
    });
    expect(res.statusCode).toBe(200);
    expect(lastPatch).toEqual({ fullName: "Maria Gomes", language: "kri" });
    expect(res.json().language).toBe("kri");
  });
});
