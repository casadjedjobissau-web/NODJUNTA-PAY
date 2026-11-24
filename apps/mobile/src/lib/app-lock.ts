import type { KeyValueStore } from "./device";

export const APP_LOCK_KEY = "nodjunta.app_lock";

// Tempo fora da app a partir do qual ela volta bloqueada.
export const LOCK_AFTER_MS = 30_000;

export function parseEnabled(value: string | null): boolean {
  return value === "1";
}

// Falha fechada: um relógio que recuou, ou valores que não são números, bloqueiam a app.
export function shouldLockOnResume(input: {
  enabled: boolean;
  backgroundedAt: number;
  now: number;
  graceMs?: number;
}): boolean {
  if (!input.enabled) {
    return false;
  }
  const elapsed = input.now - input.backgroundedAt;
  if (!Number.isFinite(elapsed) || elapsed < 0) {
    return true;
  }
  return elapsed >= (input.graceMs ?? LOCK_AFTER_MS);
}

export type AuthResult = { success: true } | { success: false; error?: string };

export type UnlockOutcome = "unlocked" | "cancelled" | "unavailable" | "failed";

export function unlockOutcome(result: AuthResult): UnlockOutcome {
  if (result.success) {
    return "unlocked";
  }
  switch (result.error) {
    case "user_cancel":
    case "system_cancel":
    case "app_cancel":
    case "user_fallback":
      return "cancelled";
    case "not_enrolled":
    case "not_available":
    case "passcode_not_set":
      return "unavailable";
    default:
      return "failed";
  }
}

export function unlockMessage(outcome: UnlockOutcome): string | null {
  switch (outcome) {
    case "unlocked":
      return null;
    case "cancelled":
      return "Desbloqueio cancelado. Toque em Desbloquear para tentar outra vez.";
    case "unavailable":
      return "A biometria ou o código do telemóvel não estão configurados. Configure-os nas definições do telemóvel, ou termine a sessão.";
    case "failed":
      return "Não foi possível desbloquear. Tente outra vez, ou termine a sessão.";
  }
}

export type EnableCheck = { ok: true } | { ok: false; message: string };

export function canEnable(capabilities: { hasHardware: boolean; isEnrolled: boolean }): EnableCheck {
  if (!capabilities.hasHardware) {
    return { ok: false, message: "Este telemóvel não tem biometria disponível." };
  }
  if (!capabilities.isEnrolled) {
    return {
      ok: false,
      message: "Registe primeiro uma impressão digital ou o rosto nas definições do telemóvel.",
    };
  }
  return { ok: true };
}

export async function loadEnabled(store: KeyValueStore): Promise<boolean> {
  try {
    return parseEnabled(await store.getItem(APP_LOCK_KEY));
  } catch {
    return false;
  }
}

export async function saveEnabled(store: KeyValueStore, enabled: boolean): Promise<void> {
  try {
    await store.setItem(APP_LOCK_KEY, enabled ? "1" : "0");
  } catch {
    return;
  }
}
