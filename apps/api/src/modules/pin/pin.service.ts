import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_HASH_PARAMS, hashPin, verifyPin, type HashParams } from "../../lib/pin-hash.js";
import { isValidPinFormat, pinProblem } from "../../lib/pin-policy.js";
import { PinError, type PinService, type PinStatus, type PinVerifyResult } from "./pin.types.js";

export interface PinServiceOptions {
  pepper: string;
  maxAttempts?: number;
  lockSeconds?: number;
  hashParams?: HashParams;
}

type Row = Record<string, unknown>;

function firstRow(data: unknown): Row | null {
  const row = Array.isArray(data) ? data[0] : data;
  return row !== null && typeof row === "object" ? (row as Row) : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function createPinService(client: SupabaseClient, options: PinServiceOptions): PinService {
  const maxAttempts = options.maxAttempts ?? 5;
  const lockSeconds = options.lockSeconds ?? 900;
  const params = options.hashParams ?? DEFAULT_HASH_PARAMS;

  function assertFormat(pin: string): void {
    if (!isValidPinFormat(pin)) {
      throw new PinError("invalid_pin_format", 400, "O PIN deve ter exatamente 6 dígitos.");
    }
  }

  function assertPolicy(pin: string): void {
    const problem = pinProblem(pin);
    if (problem) {
      throw new PinError("weak_pin", 400, problem);
    }
  }

  async function replace(userId: string, pin: string): Promise<void> {
    const hash = await hashPin(options.pepper, userId, pin, params);
    const { error } = await client.rpc("pin_replace", { p_user: userId, p_hash: hash });
    if (error) {
      throw new Error(`Falha ao guardar o PIN: ${error.message}`);
    }
  }

  async function status(userId: string): Promise<PinStatus> {
    const { data, error } = await client.rpc("pin_get_status", { p_user: userId });
    if (error) {
      throw new Error(`Falha ao ler o estado do PIN: ${error.message}`);
    }
    const row = firstRow(data);
    const lockedUntil = text(row?.out_locked_until);
    return { hasPin: row?.out_has_pin === true, locked: lockedUntil !== null, lockedUntil };
  }

  async function setInitial(userId: string, pin: string): Promise<void> {
    assertPolicy(pin);
    const hash = await hashPin(options.pepper, userId, pin, params);
    const { error } = await client.rpc("pin_set_initial", { p_user: userId, p_hash: hash });
    if (error) {
      if (error.code === "NJ019") {
        throw new PinError("pin_already_set", 409, "O PIN já está definido.");
      }
      throw new Error(`Falha ao definir o PIN: ${error.message}`);
    }
  }

  async function verify(userId: string, pin: string): Promise<PinVerifyResult> {
    assertFormat(pin);

    const reserved = await client.rpc("pin_reserve_attempt", {
      p_user: userId,
      p_max: maxAttempts,
      p_lock_seconds: lockSeconds,
    });
    if (reserved.error) {
      throw new Error(`Falha ao reservar tentativa de PIN: ${reserved.error.message}`);
    }
    const row = firstRow(reserved.data);
    if (!row) {
      throw new Error("Resposta inesperada de pin_reserve_attempt");
    }

    if (row.out_status === "not_set") {
      return { ok: false, reason: "not_set" };
    }
    if (row.out_status === "locked") {
      return { ok: false, reason: "locked", lockedUntil: text(row.out_locked_until) ?? "" };
    }
    const hash = text(row.out_hash);
    if (row.out_status !== "ok" || hash === null) {
      throw new Error("Resposta inesperada de pin_reserve_attempt");
    }

    if (await verifyPin(options.pepper, userId, pin, hash)) {
      const confirmed = await client.rpc("pin_confirm_success", { p_user: userId });
      if (confirmed.error) {
        throw new Error(`Falha ao confirmar o PIN: ${confirmed.error.message}`);
      }
      return { ok: true };
    }

    return {
      ok: false,
      reason: "invalid",
      attemptsLeft: Number(row.out_attempts_left ?? 0),
      lockedUntil: text(row.out_locked_until),
    };
  }

  async function change(userId: string, currentPin: string, newPin: string): Promise<PinVerifyResult> {
    assertFormat(currentPin);
    assertPolicy(newPin);
    if (currentPin === newPin) {
      throw new PinError("same_pin", 400, "O novo PIN tem de ser diferente do atual.");
    }
    const checked = await verify(userId, currentPin);
    if (!checked.ok) {
      return checked;
    }
    await replace(userId, newPin);
    return { ok: true };
  }

  async function reset(userId: string, newPin: string): Promise<void> {
    assertPolicy(newPin);
    await replace(userId, newPin);
  }

  return { status, setInitial, verify, change, reset };
}
