import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { loadEnv } from "../../config/env.js";
import { TEST_ENV, TEST_USER, VALID_TOKEN, makeFakeDeps } from "../../testing/fakes.js";
import type { AuditEntry } from "../audit/audit.types.js";
import type { PinService, PinVerifyResult } from "./pin.types.js";

const env = loadEnv(TEST_ENV);
const PIN = "482913";
const LOCK_UNTIL = "2026-11-14T10:00:00.000Z";

const auth = { authorization: `Bearer ${VALID_TOKEN}` };
const transferHeaders = { ...auth, "idempotency-key": "chave-pin-0001" };
const transferBody = { toPhone: "+245955000002", amount: 1000 };

let app: Awaited<ReturnType<typeof buildApp>>;
let appOff: Awaited<ReturnType<typeof buildApp>>;
let verifyCalls: Array<{ userId: string; pin: string }> = [];
let verifyResult: PinVerifyResult = { ok: true };
let audits: AuditEntry[] = [];

function makePin(): PinService {
  return {
    status: async () => ({ hasPin: true, locked: false, lockedUntil: null }),
    setInitial: async () => undefined,
    verify: async (userId, pin) => {
      verifyCalls.push({ userId, pin });
      return verifyResult;
    },
    change: async () => ({ ok: true }),
    reset: async () => undefined,
  };
}

function makeDeps(pinEnforced?: boolean) {
  const overrides = {
    pin: makePin(),
    audit: {
      record: async (entry: AuditEntry) => {
        audits.push(entry);
      },
    },
  };
  return makeFakeDeps(pinEnforced === undefined ? overrides : { ...overrides, pinEnforced });
}

beforeAll(async () => {
  app = await buildApp(env, makeDeps());
  appOff = await buildApp(env, makeDeps(false));
});
afterAll(async () => {
  await app.close();
  await appOff.close();
});
beforeEach(() => {
  verifyCalls = [];
  verifyResult = { ok: true };
  audits = [];
});

describe("guarda do PIN", () => {
  it("400 pin_required sem o cabeçalho X-Pin", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/transfers",
      headers: transferHeaders,
      payload: transferBody,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("pin_required");
    expect(verifyCalls).toHaveLength(0);
  });

  it("400 invalid_pin_format com um PIN que não tem 6 dígitos", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/transfers",
      headers: { ...transferHeaders, "x-pin": "12345" },
      payload: transferBody,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_pin_format");
    expect(verifyCalls).toHaveLength(0);
  });

  it("403 pin_not_set quando o utilizador ainda não definiu o PIN", async () => {
    verifyResult = { ok: false, reason: "not_set" };
    const res = await app.inject({
      method: "POST",
      url: "/v1/transfers",
      headers: { ...transferHeaders, "x-pin": PIN },
      payload: transferBody,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("pin_not_set");
  });

  it("403 invalid_pin com as tentativas restantes", async () => {
    verifyResult = { ok: false, reason: "invalid", attemptsLeft: 2, lockedUntil: null };
    const res = await app.inject({
      method: "POST",
      url: "/v1/transfers",
      headers: { ...transferHeaders, "x-pin": PIN },
      payload: transferBody,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("invalid_pin");
    expect(res.json().attemptsLeft).toBe(2);
    expect(res.json().message).toContain("2");
  });

  it("429 pin_locked quando o PIN está bloqueado", async () => {
    verifyResult = { ok: false, reason: "locked", lockedUntil: LOCK_UNTIL };
    const res = await app.inject({
      method: "POST",
      url: "/v1/transfers",
      headers: { ...transferHeaders, "x-pin": PIN },
      payload: transferBody,
    });
    expect(res.statusCode).toBe(429);
    expect(res.json().error).toBe("pin_locked");
    expect(res.json().lockedUntil).toBe(LOCK_UNTIL);
  });

  it("a última tentativa falhada devolve 429 e fica na auditoria como PIN_LOCKED", async () => {
    verifyResult = { ok: false, reason: "invalid", attemptsLeft: 0, lockedUntil: LOCK_UNTIL };
    const res = await app.inject({
      method: "POST",
      url: "/v1/transfers",
      headers: { ...transferHeaders, "x-pin": PIN },
      payload: transferBody,
    });
    expect(res.statusCode).toBe(429);
    expect(res.json().error).toBe("pin_locked");
    expect(audits.some((entry) => entry.action === "PIN_LOCKED" && entry.actorId === TEST_USER.id)).toBe(true);
  });

  it("201 com o PIN certo, e o serviço recebe o utilizador e o PIN", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/transfers",
      headers: { ...transferHeaders, "x-pin": PIN },
      payload: transferBody,
    });
    expect(res.statusCode).toBe(201);
    expect(verifyCalls).toEqual([{ userId: TEST_USER.id, pin: PIN }]);
  });

  it("aplica-se ao pagamento a comerciante", async () => {
    const headers = { ...auth, "idempotency-key": "chave-pin-0002" };
    const payload = { merchantCode: "AB12CD34", amount: 1500 };

    const without = await app.inject({ method: "POST", url: "/v1/payments/merchant", headers, payload });
    expect(without.statusCode).toBe(400);
    expect(without.json().error).toBe("pin_required");

    const withPin = await app.inject({
      method: "POST",
      url: "/v1/payments/merchant",
      headers: { ...headers, "x-pin": PIN },
      payload,
    });
    expect(withPin.statusCode).toBe(201);
  });

  it("aplica-se ao levantamento", async () => {
    const headers = { ...auth, "idempotency-key": "chave-pin-0003" };
    const payload = { amount: 2000, destination: "+245955000099" };

    const without = await app.inject({ method: "POST", url: "/v1/withdrawals", headers, payload });
    expect(without.statusCode).toBe(400);
    expect(without.json().error).toBe("pin_required");

    const withPin = await app.inject({
      method: "POST",
      url: "/v1/withdrawals",
      headers: { ...headers, "x-pin": PIN },
      payload,
    });
    expect(withPin.statusCode).toBe(201);
  });

  it("não se aplica a leituras como GET /v1/wallet", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/wallet", headers: auth });
    expect(res.statusCode).toBe(200);
    expect(verifyCalls).toHaveLength(0);
  });

  it("não se aplica a operações sem dinheiro como POST /v1/devices", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/devices",
      headers: auth,
      payload: { deviceId: "dispositivo-0001", platform: "android" },
    });
    expect(res.statusCode).toBe(200);
    expect(verifyCalls).toHaveLength(0);
  });

  it("a resposta de erro nunca devolve o PIN", async () => {
    verifyResult = { ok: false, reason: "invalid", attemptsLeft: 2, lockedUntil: null };
    const res = await app.inject({
      method: "POST",
      url: "/v1/transfers",
      headers: { ...transferHeaders, "x-pin": PIN },
      payload: transferBody,
    });
    expect(res.body).not.toContain(PIN);
  });

  it("com pinEnforced=false a guarda não atua", async () => {
    const res = await appOff.inject({
      method: "POST",
      url: "/v1/transfers",
      headers: transferHeaders,
      payload: transferBody,
    });
    expect(res.statusCode).toBe(201);
    expect(verifyCalls).toHaveLength(0);
  });

  it("com pinEnforced=false as rotas do PIN continuam disponíveis", async () => {
    const res = await appOff.inject({ method: "GET", url: "/v1/pin", headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ hasPin: true, locked: false, lockedUntil: null });
  });
});
