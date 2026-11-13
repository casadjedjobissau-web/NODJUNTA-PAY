import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { loadEnv } from "../../config/env.js";
import type { Authenticator } from "../../plugins/auth.js";
import { TEST_ENV, TEST_USER, VALID_TOKEN, makeFakeDeps } from "../../testing/fakes.js";
import { PinError, type PinService, type PinStatus, type PinVerifyResult } from "./pin.types.js";

const env = loadEnv(TEST_ENV);

const RECENT = "token-login-recente";
const OLD = "token-login-antigo";
const LOCK_UNTIL = "2026-11-14T10:00:00.000Z";

const authenticator: Authenticator = async (token) => {
  if (token === RECENT) {
    return { id: TEST_USER.id, phone: null, lastSignInAt: new Date().toISOString() };
  }
  if (token === OLD) {
    return { id: TEST_USER.id, phone: null, lastSignInAt: new Date(Date.now() - 3_600_000).toISOString() };
  }
  return token === VALID_TOKEN ? TEST_USER : null;
};

let counter = 0;
function headers(token: string) {
  counter += 1;
  return {
    authorization: `Bearer ${token}`,
    "x-forwarded-for": `10.9.${Math.floor(counter / 250)}.${(counter % 250) + 1}`,
  };
}

let app: Awaited<ReturnType<typeof buildApp>>;
let statusValue: PinStatus;
let setBehavior: () => Promise<void>;
let changeResult: PinVerifyResult;
let setCalls: Array<{ userId: string; pin: string }> = [];
let changeCalls: Array<{ userId: string; currentPin: string; newPin: string }> = [];
let resetCalls: Array<{ userId: string; newPin: string }> = [];

const pinService: PinService = {
  status: async () => statusValue,
  setInitial: async (userId, pin) => {
    setCalls.push({ userId, pin });
    await setBehavior();
  },
  verify: async () => ({ ok: true }),
  change: async (userId, currentPin, newPin) => {
    changeCalls.push({ userId, currentPin, newPin });
    return changeResult;
  },
  reset: async (userId, newPin) => {
    resetCalls.push({ userId, newPin });
  },
};

beforeAll(async () => {
  app = await buildApp(env, makeFakeDeps({ authenticator, pin: pinService }));
});
afterAll(async () => {
  await app.close();
});
beforeEach(() => {
  statusValue = { hasPin: true, locked: false, lockedUntil: null };
  setBehavior = async () => undefined;
  changeResult = { ok: true };
  setCalls = [];
  changeCalls = [];
  resetCalls = [];
});

describe("GET /v1/pin", () => {
  it("401 sem token", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/pin" });
    expect(res.statusCode).toBe(401);
  });

  it("200 devolve o estado do PIN", async () => {
    statusValue = { hasPin: true, locked: true, lockedUntil: LOCK_UNTIL };
    const res = await app.inject({ method: "GET", url: "/v1/pin", headers: headers(VALID_TOKEN) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ hasPin: true, locked: true, lockedUntil: LOCK_UNTIL });
  });
});

describe("POST /v1/pin (definir)", () => {
  it("400 com um PIN que não tem 6 dígitos", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/pin",
      headers: headers(VALID_TOKEN),
      payload: { pin: "1234" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_body");
    expect(setCalls).toHaveLength(0);
  });

  it("400 com campos que não existem", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/pin",
      headers: headers(VALID_TOKEN),
      payload: { pin: "482913", extra: 1 },
    });
    expect(res.statusCode).toBe(400);
    expect(setCalls).toHaveLength(0);
  });

  it("201 define o PIN do utilizador autenticado", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/pin",
      headers: headers(VALID_TOKEN),
      payload: { pin: "482913" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ ok: true });
    expect(setCalls).toEqual([{ userId: TEST_USER.id, pin: "482913" }]);
  });

  it("400 weak_pin quando o serviço recusa um PIN fraco", async () => {
    setBehavior = async () => {
      throw new PinError("weak_pin", 400, "O PIN não pode ser uma sequência de números.");
    };
    const res = await app.inject({
      method: "POST",
      url: "/v1/pin",
      headers: headers(VALID_TOKEN),
      payload: { pin: "135790" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("weak_pin");
  });

  it("409 pin_already_set quando o PIN já existe", async () => {
    setBehavior = async () => {
      throw new PinError("pin_already_set", 409, "O PIN já está definido.");
    };
    const res = await app.inject({
      method: "POST",
      url: "/v1/pin",
      headers: headers(VALID_TOKEN),
      payload: { pin: "482913" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("pin_already_set");
  });
});

describe("POST /v1/pin/change (trocar)", () => {
  it("400 sem o PIN novo", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/pin/change",
      headers: headers(VALID_TOKEN),
      payload: { currentPin: "482913" },
    });
    expect(res.statusCode).toBe(400);
    expect(changeCalls).toHaveLength(0);
  });

  it("403 invalid_pin quando o PIN atual está errado", async () => {
    changeResult = { ok: false, reason: "invalid", attemptsLeft: 2, lockedUntil: null };
    const res = await app.inject({
      method: "POST",
      url: "/v1/pin/change",
      headers: headers(VALID_TOKEN),
      payload: { currentPin: "135790", newPin: "907312" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("invalid_pin");
    expect(res.json().attemptsLeft).toBe(2);
  });

  it("200 troca o PIN e o serviço recebe os dois PIN", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/pin/change",
      headers: headers(VALID_TOKEN),
      payload: { currentPin: "482913", newPin: "907312" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(changeCalls).toEqual([{ userId: TEST_USER.id, currentPin: "482913", newPin: "907312" }]);
  });

  it("429 pin_locked quando o PIN está bloqueado", async () => {
    changeResult = { ok: false, reason: "locked", lockedUntil: LOCK_UNTIL };
    const res = await app.inject({
      method: "POST",
      url: "/v1/pin/change",
      headers: headers(VALID_TOKEN),
      payload: { currentPin: "482913", newPin: "907312" },
    });
    expect(res.statusCode).toBe(429);
    expect(res.json().error).toBe("pin_locked");
    expect(res.json().lockedUntil).toBe(LOCK_UNTIL);
  });
});

describe("POST /v1/pin/reset (recuperar)", () => {
  it("403 recent_login_required quando o login não tem data", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/pin/reset",
      headers: headers(VALID_TOKEN),
      payload: { newPin: "907312" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("recent_login_required");
    expect(resetCalls).toHaveLength(0);
  });

  it("403 recent_login_required quando o login foi há mais de 10 minutos", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/pin/reset",
      headers: headers(OLD),
      payload: { newPin: "907312" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("recent_login_required");
    expect(resetCalls).toHaveLength(0);
  });

  it("200 recupera o PIN com um login recente", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/pin/reset",
      headers: headers(RECENT),
      payload: { newPin: "907312" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(resetCalls).toEqual([{ userId: TEST_USER.id, newPin: "907312" }]);
  });
});
