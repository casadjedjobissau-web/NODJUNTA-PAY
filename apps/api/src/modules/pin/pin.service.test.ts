import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { hashPin, verifyPin } from "../../lib/pin-hash.js";
import { createPinService } from "./pin.service.js";

type RpcResult = { data: unknown; error: { code?: string; message: string } | null };
type Handler = (params: Record<string, unknown>) => RpcResult;
interface RpcCall {
  fn: string;
  params: Record<string, unknown>;
}

const PEPPER = "pimenta-de-teste-com-mais-de-32-caracteres!!";
const PARAMS = { N: 16, r: 8, p: 1 };
const USER = "11111111-1111-4111-8111-111111111111";
const GOOD = "482913";
const NEW_PIN = "907312";
const LOCK_UNTIL = "2026-11-14T10:15:00.000Z";

function makeClient(handlers: Record<string, Handler>) {
  const calls: RpcCall[] = [];
  const client = {
    rpc: async (fn: string, params: Record<string, unknown>) => {
      calls.push({ fn, params });
      const handler = handlers[fn];
      if (!handler) {
        throw new Error(`rpc inesperado: ${fn}`);
      }
      return handler(params);
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

function makeService(handlers: Record<string, Handler>) {
  const { client, calls } = makeClient(handlers);
  return { service: createPinService(client, { pepper: PEPPER, hashParams: PARAMS }), calls };
}

const ok: Handler = () => ({ data: null, error: null });

function reserved(
  hash: string | null,
  attemptsLeft: number,
  lockedUntil: string | null,
  status = "ok",
): Handler {
  return () => ({
    data: [
      {
        out_status: status,
        out_hash: hash,
        out_attempts_left: attemptsLeft,
        out_locked_until: lockedUntil,
      },
    ],
    error: null,
  });
}

describe("createPinService: estado e definição", () => {
  it("status sem PIN", async () => {
    const { service, calls } = makeService({
      pin_get_status: () => ({ data: [{ out_has_pin: false, out_locked_until: null }], error: null }),
    });

    expect(await service.status(USER)).toEqual({ hasPin: false, locked: false, lockedUntil: null });
    expect(calls).toEqual([{ fn: "pin_get_status", params: { p_user: USER } }]);
  });

  it("status bloqueado", async () => {
    const { service } = makeService({
      pin_get_status: () => ({ data: [{ out_has_pin: true, out_locked_until: LOCK_UNTIL }], error: null }),
    });

    expect(await service.status(USER)).toEqual({ hasPin: true, locked: true, lockedUntil: LOCK_UNTIL });
  });

  it("setInitial envia só o hash, nunca o PIN", async () => {
    let captured: Record<string, unknown> = {};
    const { service } = makeService({
      pin_set_initial: (params) => {
        captured = params;
        return { data: null, error: null };
      },
    });

    await service.setInitial(USER, GOOD);

    const hash = String(captured.p_hash);
    expect(captured.p_user).toBe(USER);
    expect(hash.startsWith("scrypt$16$8$1$")).toBe(true);
    expect(JSON.stringify(captured)).not.toContain(GOOD);
    expect(await verifyPin(PEPPER, USER, GOOD, hash)).toBe(true);
  });

  it("setInitial recusa um PIN fraco sem falar com a base de dados", async () => {
    const { service, calls } = makeService({});

    await expect(service.setInitial(USER, "123456")).rejects.toMatchObject({
      code: "weak_pin",
      httpStatus: 400,
    });
    expect(calls).toEqual([]);
  });

  it("setInitial: NJ019 vira pin_already_set (409)", async () => {
    const { service } = makeService({
      pin_set_initial: () => ({ data: null, error: { code: "NJ019", message: "ja definido" } }),
    });

    await expect(service.setInitial(USER, GOOD)).rejects.toMatchObject({
      code: "pin_already_set",
      httpStatus: 409,
    });
  });
});

describe("createPinService: verificação", () => {
  it("verify: sem PIN definido", async () => {
    const { service } = makeService({ pin_reserve_attempt: reserved(null, 0, null, "not_set") });

    expect(await service.verify(USER, GOOD)).toEqual({ ok: false, reason: "not_set" });
  });

  it("verify: bloqueado devolve até quando", async () => {
    const { service } = makeService({ pin_reserve_attempt: reserved(null, 0, LOCK_UNTIL, "locked") });

    expect(await service.verify(USER, GOOD)).toEqual({ ok: false, reason: "locked", lockedUntil: LOCK_UNTIL });
  });

  it("verify: PIN certo confirma o sucesso na base de dados", async () => {
    const hash = await hashPin(PEPPER, USER, GOOD, PARAMS);
    const { service, calls } = makeService({
      pin_reserve_attempt: reserved(hash, 4, null),
      pin_confirm_success: ok,
    });

    expect(await service.verify(USER, GOOD)).toEqual({ ok: true });
    expect(calls.map((call) => call.fn)).toEqual(["pin_reserve_attempt", "pin_confirm_success"]);
  });

  it("verify: PIN errado devolve as tentativas restantes e não confirma nada", async () => {
    const hash = await hashPin(PEPPER, USER, GOOD, PARAMS);
    const { service, calls } = makeService({ pin_reserve_attempt: reserved(hash, 3, null) });

    expect(await service.verify(USER, "135790")).toEqual({
      ok: false,
      reason: "invalid",
      attemptsLeft: 3,
      lockedUntil: null,
    });
    expect(calls.map((call) => call.fn)).toEqual(["pin_reserve_attempt"]);
  });

  it("verify: a última tentativa falhada devolve o bloqueio", async () => {
    const hash = await hashPin(PEPPER, USER, GOOD, PARAMS);
    const { service } = makeService({ pin_reserve_attempt: reserved(hash, 0, LOCK_UNTIL) });

    expect(await service.verify(USER, "135790")).toEqual({
      ok: false,
      reason: "invalid",
      attemptsLeft: 0,
      lockedUntil: LOCK_UNTIL,
    });
  });

  it("verify: formato inválido é recusado sem gastar uma tentativa", async () => {
    const { service, calls } = makeService({});

    await expect(service.verify(USER, "12ab")).rejects.toMatchObject({
      code: "invalid_pin_format",
      httpStatus: 400,
    });
    expect(calls).toEqual([]);
  });

  it("verify: por omissão são 5 tentativas e 900 segundos de bloqueio", async () => {
    let captured: Record<string, unknown> = {};
    const { service } = makeService({
      pin_reserve_attempt: (params) => {
        captured = params;
        return reserved(null, 0, null, "not_set")(params);
      },
    });

    await service.verify(USER, GOOD);

    expect(captured).toEqual({ p_user: USER, p_max: 5, p_lock_seconds: 900 });
  });
});

describe("createPinService: troca e recuperação", () => {
  it("change: recusa um PIN novo fraco antes de gastar uma tentativa", async () => {
    const { service, calls } = makeService({});

    await expect(service.change(USER, GOOD, "654321")).rejects.toMatchObject({
      code: "weak_pin",
      httpStatus: 400,
    });
    expect(calls).toEqual([]);
  });

  it("change: o PIN novo tem de ser diferente do atual", async () => {
    const { service, calls } = makeService({});

    await expect(service.change(USER, GOOD, GOOD)).rejects.toMatchObject({
      code: "same_pin",
      httpStatus: 400,
    });
    expect(calls).toEqual([]);
  });

  it("change: PIN atual errado não troca nada", async () => {
    const hash = await hashPin(PEPPER, USER, GOOD, PARAMS);
    const { service, calls } = makeService({ pin_reserve_attempt: reserved(hash, 3, null) });

    expect(await service.change(USER, "135790", NEW_PIN)).toEqual({
      ok: false,
      reason: "invalid",
      attemptsLeft: 3,
      lockedUntil: null,
    });
    expect(calls.map((call) => call.fn)).toEqual(["pin_reserve_attempt"]);
  });

  it("change: com o PIN atual certo guarda o hash do PIN novo", async () => {
    const hash = await hashPin(PEPPER, USER, GOOD, PARAMS);
    let replaced: Record<string, unknown> = {};
    const { service, calls } = makeService({
      pin_reserve_attempt: reserved(hash, 4, null),
      pin_confirm_success: ok,
      pin_replace: (params) => {
        replaced = params;
        return { data: null, error: null };
      },
    });

    expect(await service.change(USER, GOOD, NEW_PIN)).toEqual({ ok: true });

    const newHash = String(replaced.p_hash);
    expect(calls.map((call) => call.fn)).toEqual(["pin_reserve_attempt", "pin_confirm_success", "pin_replace"]);
    expect(await verifyPin(PEPPER, USER, NEW_PIN, newHash)).toBe(true);
    expect(await verifyPin(PEPPER, USER, GOOD, newHash)).toBe(false);
  });

  it("reset: guarda o hash do PIN novo e recusa PINs fracos", async () => {
    let replaced: Record<string, unknown> = {};
    const { service, calls } = makeService({
      pin_replace: (params) => {
        replaced = params;
        return { data: null, error: null };
      },
    });

    await service.reset(USER, NEW_PIN);
    expect(await verifyPin(PEPPER, USER, NEW_PIN, String(replaced.p_hash))).toBe(true);
    expect(calls).toHaveLength(1);

    await expect(service.reset(USER, "111111")).rejects.toMatchObject({ code: "weak_pin" });
    expect(calls).toHaveLength(1);
  });
});
