import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { loadEnv } from "../../config/env.js";
import { TEST_ENV, TEST_USER, VALID_TOKEN, makeFakeDeps } from "../../testing/fakes.js";
import type { DeviceInput } from "./devices.types.js";

const env = loadEnv(TEST_ENV);
const auth = { authorization: `Bearer ${VALID_TOKEN}` };

let app: Awaited<ReturnType<typeof buildApp>>;
let registered: { userId: string; input: DeviceInput } | null = null;
let removed: { userId: string; deviceId: string } | null = null;

beforeAll(async () => {
  app = await buildApp(
    env,
    makeFakeDeps({
      devices: {
        register: async (userId, input) => {
          registered = { userId, input };
        },
        remove: async (userId, deviceId) => {
          removed = { userId, deviceId };
        },
      },
    }),
  );
});
afterAll(async () => {
  await app.close();
});

describe("/v1/devices", () => {
  it("POST 401 sem token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/devices",
      payload: { deviceId: "dispositivo-0001", platform: "android" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST 400 com plataforma inválida", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/devices",
      headers: auth,
      payload: { deviceId: "dispositivo-0001", platform: "windows" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST 200 repassa os dados ao serviço", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/devices",
      headers: auth,
      payload: { deviceId: "dispositivo-0001", platform: "android", pushToken: "token-push" },
    });
    expect(res.statusCode).toBe(200);
    expect(registered).toEqual({
      userId: TEST_USER.id,
      input: { deviceId: "dispositivo-0001", platform: "android", pushToken: "token-push" },
    });
  });

  it("DELETE 204 remove o dispositivo do utilizador autenticado", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/v1/devices/dispositivo-0001",
      headers: auth,
    });
    expect(res.statusCode).toBe(204);
    expect(removed).toEqual({ userId: TEST_USER.id, deviceId: "dispositivo-0001" });
  });
});
