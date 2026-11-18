import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { loadEnv } from "../../config/env.js";
import type { Authenticator } from "../../plugins/auth.js";
import { TEST_ENV, TEST_USER, VALID_TOKEN, makeFakeDeps } from "../../testing/fakes.js";
import type { PinService, PinVerifyResult } from "../pin/pin.types.js";
import { AccountError, type AccountService, type DeleteResult, type DeletionCheck } from "./account.types.js";

const env = loadEnv(TEST_ENV);

const RECENT = "token-login-recente";
const OLD = "token-login-antigo";
const PIN = "482913";
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
function headers(token: string, extra: Record<string, string> = {}) {
  counter += 1;
  return {
    authorization: `Bearer ${token}`,
    "x-forwarded-for": `10.7.${Math.floor(counter / 250)}.${(counter % 250) + 1}`,
    ...extra,
  };
}

let app: Awaited<ReturnType<typeof buildApp>>;
let appNoPin: Awaited<ReturnType<typeof buildApp>>;
let appPinOff: Awaited<ReturnType<typeof buildApp>>;
let appWithout: Awaited<ReturnType<typeof buildApp>>;

let checkValue: DeletionCheck;
let deleteResult: DeleteResult;
let deleteFailure: Error | null = null;
let deleteCalls: string[] = [];
let hasPin = true;
let verifyResult: PinVerifyResult = { ok: true };
let verifyCalls: Array<{ userId: string; pin: string }> = [];

const accountService: AccountService = {
  checkDeletion: async () => checkValue,
  deleteAccount: async (userId) => {
    deleteCalls.push(userId);
    if (deleteFailure) {
      throw deleteFailure;
    }
    return deleteResult;
  },
};

const pinService: PinService = {
  status: async () => ({ hasPin, locked: false, lockedUntil: null }),
  setInitial: async () => undefined,
  verify: async (userId, pin) => {
    verifyCalls.push({ userId, pin });
    return verifyResult;
  },
  change: async () => ({ ok: true }),
  reset: async () => undefined,
};

beforeAll(async () => {
  app = await buildApp(env, makeFakeDeps({ authenticator, account: accountService, pin: pinService }));
  appNoPin = await buildApp(env, makeFakeDeps({ authenticator, account: accountService }));
  appPinOff = await buildApp(
    env,
    makeFakeDeps({ authenticator, account: accountService, pin: pinService, pinEnforced: false }),
  );
  appWithout = await buildApp(env, makeFakeDeps({ authenticator }));
});
afterAll(async () => {
  await app.close();
  await appNoPin.close();
  await appPinOff.close();
  await appWithout.close();
});
beforeEach(() => {
  checkValue = { canDelete: true, alreadyDeleted: false, blockers: [] };
  deleteResult = "deleted";
  deleteFailure = null;
  deleteCalls = [];
  hasPin = true;
  verifyResult = { ok: true };
  verifyCalls = [];
});

describe("GET /v1/account/deletion-check", () => {
  it("401 sem token", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/account/deletion-check" });
    expect(res.statusCode).toBe(401);
  });

  it("200 devolve os bloqueios com uma mensagem para cada um", async () => {
    checkValue = { canDelete: false, alreadyDeleted: false, blockers: ["balance", "frozen"] };
    const res = await app.inject({
      method: "GET",
      url: "/v1/account/deletion-check",
      headers: headers(VALID_TOKEN),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.canDelete).toBe(false);
    expect(body.alreadyDeleted).toBe(false);
    expect(body.blockers.map((item: { code: string }) => item.code)).toEqual(["balance", "frozen"]);
    expect(body.blockers[0].message).toContain("saldo");
    expect(body.blockers[1].message).toContain("bloqueada");
  });

  it("200 quando a conta pode ser eliminada", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/account/deletion-check",
      headers: headers(VALID_TOKEN),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ canDelete: true, alreadyDeleted: false, blockers: [] });
  });
});

describe("POST /v1/account/delete: pedido", () => {
  it("401 sem token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/account/delete",
      payload: { confirm: "ELIMINAR" },
    });
    expect(res.statusCode).toBe(401);
    expect(deleteCalls).toHaveLength(0);
  });

  it("400 sem a confirmação escrita", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/account/delete",
      headers: headers(RECENT),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_body");
    expect(res.json().message).toContain("ELIMINAR");
    expect(deleteCalls).toHaveLength(0);
  });

  it("400 com a confirmação em minúsculas", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/account/delete",
      headers: headers(RECENT),
      payload: { confirm: "eliminar" },
    });
    expect(res.statusCode).toBe(400);
    expect(deleteCalls).toHaveLength(0);
  });

  it("400 com campos que não existem", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/account/delete",
      headers: headers(RECENT),
      payload: { confirm: "ELIMINAR", forcar: true },
    });
    expect(res.statusCode).toBe(400);
    expect(deleteCalls).toHaveLength(0);
  });
});

describe("POST /v1/account/delete: login recente", () => {
  it("403 recent_login_required quando o login não tem data", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/account/delete",
      headers: headers(VALID_TOKEN, { "x-pin": PIN }),
      payload: { confirm: "ELIMINAR" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("recent_login_required");
    expect(deleteCalls).toHaveLength(0);
  });

  it("403 com um login antigo, e sem gastar tentativas de PIN", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/account/delete",
      headers: headers(OLD, { "x-pin": PIN }),
      payload: { confirm: "ELIMINAR" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("recent_login_required");
    expect(verifyCalls).toHaveLength(0);
    expect(deleteCalls).toHaveLength(0);
  });
});

describe("POST /v1/account/delete: PIN", () => {
  it("400 pin_required quando o utilizador tem PIN e não o envia", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/account/delete",
      headers: headers(RECENT),
      payload: { confirm: "ELIMINAR" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("pin_required");
    expect(verifyCalls).toHaveLength(0);
    expect(deleteCalls).toHaveLength(0);
  });

  it("400 invalid_pin_format com um PIN que não tem 6 dígitos", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/account/delete",
      headers: headers(RECENT, { "x-pin": "12345" }),
      payload: { confirm: "ELIMINAR" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_pin_format");
    expect(verifyCalls).toHaveLength(0);
  });

  it("403 invalid_pin e a conta não é eliminada", async () => {
    verifyResult = { ok: false, reason: "invalid", attemptsLeft: 2, lockedUntil: null };
    const res = await app.inject({
      method: "POST",
      url: "/v1/account/delete",
      headers: headers(RECENT, { "x-pin": PIN }),
      payload: { confirm: "ELIMINAR" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("invalid_pin");
    expect(res.json().attemptsLeft).toBe(2);
    expect(deleteCalls).toHaveLength(0);
  });

  it("429 pin_locked quando o PIN está bloqueado", async () => {
    verifyResult = { ok: false, reason: "locked", lockedUntil: LOCK_UNTIL };
    const res = await app.inject({
      method: "POST",
      url: "/v1/account/delete",
      headers: headers(RECENT, { "x-pin": PIN }),
      payload: { confirm: "ELIMINAR" },
    });
    expect(res.statusCode).toBe(429);
    expect(res.json().error).toBe("pin_locked");
    expect(deleteCalls).toHaveLength(0);
  });

  it("a resposta de erro nunca devolve o PIN", async () => {
    verifyResult = { ok: false, reason: "invalid", attemptsLeft: 2, lockedUntil: null };
    const res = await app.inject({
      method: "POST",
      url: "/v1/account/delete",
      headers: headers(RECENT, { "x-pin": PIN }),
      payload: { confirm: "ELIMINAR" },
    });
    expect(res.body).not.toContain(PIN);
  });
});

describe("POST /v1/account/delete: eliminação", () => {
  it("200 com o PIN certo: o serviço recebe o PIN e o utilizador", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/account/delete",
      headers: headers(RECENT, { "x-pin": PIN }),
      payload: { confirm: "ELIMINAR" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "deleted" });
    expect(verifyCalls).toEqual([{ userId: TEST_USER.id, pin: PIN }]);
    expect(deleteCalls).toEqual([TEST_USER.id]);
  });

  it("200 sem PIN definido: não pede o cabeçalho", async () => {
    hasPin = false;
    const res = await app.inject({
      method: "POST",
      url: "/v1/account/delete",
      headers: headers(RECENT),
      payload: { confirm: "ELIMINAR" },
    });
    expect(res.statusCode).toBe(200);
    expect(verifyCalls).toHaveLength(0);
    expect(deleteCalls).toEqual([TEST_USER.id]);
  });

  it("200 sem serviço de PIN configurado", async () => {
    const res = await appNoPin.inject({
      method: "POST",
      url: "/v1/account/delete",
      headers: headers(RECENT),
      payload: { confirm: "ELIMINAR" },
    });
    expect(res.statusCode).toBe(200);
    expect(deleteCalls).toEqual([TEST_USER.id]);
  });

  it("200 com pinEnforced=false: não pede o PIN", async () => {
    const res = await appPinOff.inject({
      method: "POST",
      url: "/v1/account/delete",
      headers: headers(RECENT),
      payload: { confirm: "ELIMINAR" },
    });
    expect(res.statusCode).toBe(200);
    expect(verifyCalls).toHaveLength(0);
    expect(deleteCalls).toEqual([TEST_USER.id]);
  });

  it("409 quando ainda há saldo", async () => {
    deleteFailure = new AccountError("balance_not_zero", 409, "Ainda tem saldo na carteira.");
    const res = await app.inject({
      method: "POST",
      url: "/v1/account/delete",
      headers: headers(RECENT, { "x-pin": PIN }),
      payload: { confirm: "ELIMINAR" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("balance_not_zero");
  });

  it("200 com already_deleted quando a conta já tinha sido eliminada", async () => {
    deleteResult = "already_deleted";
    const res = await app.inject({
      method: "POST",
      url: "/v1/account/delete",
      headers: headers(RECENT, { "x-pin": PIN }),
      payload: { confirm: "ELIMINAR" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "already_deleted" });
  });
});

describe("sem serviço de conta", () => {
  it("as rotas não existem", async () => {
    const res = await appWithout.inject({
      method: "GET",
      url: "/v1/account/deletion-check",
      headers: headers(VALID_TOKEN),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("not_found");
  });
});
