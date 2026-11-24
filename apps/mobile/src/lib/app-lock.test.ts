import { describe, expect, it } from "vitest";
import {
  APP_LOCK_KEY,
  LOCK_AFTER_MS,
  canEnable,
  loadEnabled,
  parseEnabled,
  saveEnabled,
  shouldLockOnResume,
  unlockMessage,
  unlockOutcome,
} from "./app-lock";
import type { KeyValueStore } from "./device";

function makeStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const store: KeyValueStore = {
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
  };
  return { data, store };
}

describe("parseEnabled", () => {
  it("só o valor 1 liga o bloqueio", () => {
    expect(parseEnabled("1")).toBe(true);
    for (const value of [null, "", "0", "true", "sim"]) {
      expect(parseEnabled(value)).toBe(false);
    }
  });
});

describe("shouldLockOnResume", () => {
  it("com o bloqueio desligado nunca bloqueia", () => {
    expect(shouldLockOnResume({ enabled: false, backgroundedAt: 0, now: 10 * 60_000 })).toBe(false);
  });

  it("não bloqueia antes do tempo", () => {
    expect(shouldLockOnResume({ enabled: true, backgroundedAt: 1000, now: 1000 + LOCK_AFTER_MS - 1 })).toBe(false);
  });

  it("bloqueia ao fim do tempo e depois", () => {
    expect(shouldLockOnResume({ enabled: true, backgroundedAt: 1000, now: 1000 + LOCK_AFTER_MS })).toBe(true);
    expect(shouldLockOnResume({ enabled: true, backgroundedAt: 1000, now: 1000 + 5 * LOCK_AFTER_MS })).toBe(true);
  });

  it("falha fechada: relógio que recuou ou valores inválidos bloqueiam", () => {
    expect(shouldLockOnResume({ enabled: true, backgroundedAt: 5000, now: 1000 })).toBe(true);
    expect(shouldLockOnResume({ enabled: true, backgroundedAt: Number.NaN, now: 1000 })).toBe(true);
    expect(shouldLockOnResume({ enabled: true, backgroundedAt: 0, now: Number.POSITIVE_INFINITY })).toBe(true);
  });

  it("respeita um tempo personalizado", () => {
    expect(shouldLockOnResume({ enabled: true, backgroundedAt: 0, now: 4999, graceMs: 5000 })).toBe(false);
    expect(shouldLockOnResume({ enabled: true, backgroundedAt: 0, now: 5000, graceMs: 5000 })).toBe(true);
  });

  it("o tempo por omissão é de 30 segundos", () => {
    expect(LOCK_AFTER_MS).toBe(30_000);
  });
});

describe("unlockOutcome", () => {
  it("sucesso desbloqueia", () => {
    expect(unlockOutcome({ success: true })).toBe("unlocked");
  });

  it("cancelar, em qualquer das formas, é 'cancelled'", () => {
    for (const error of ["user_cancel", "system_cancel", "app_cancel", "user_fallback"]) {
      expect(unlockOutcome({ success: false, error })).toBe("cancelled");
    }
  });

  it("biometria ou código por configurar é 'unavailable'", () => {
    for (const error of ["not_enrolled", "not_available", "passcode_not_set"]) {
      expect(unlockOutcome({ success: false, error })).toBe("unavailable");
    }
  });

  it("o resto é 'failed', incluindo bloqueios por tentativas e erros desconhecidos", () => {
    for (const error of ["lockout", "authentication_failed", "timeout", "algo_novo", undefined]) {
      expect(unlockOutcome({ success: false, error })).toBe("failed");
    }
  });
});

describe("unlockMessage", () => {
  it("desbloquear não tem mensagem e cada falha tem a sua", () => {
    expect(unlockMessage("unlocked")).toBeNull();
    const messages = (["cancelled", "unavailable", "failed"] as const).map(unlockMessage);
    expect(new Set(messages).size).toBe(3);
    for (const message of messages) {
      expect(message?.length).toBeGreaterThan(0);
    }
  });
});

describe("canEnable", () => {
  it("sem biometria no telemóvel não se liga", () => {
    expect(canEnable({ hasHardware: false, isEnrolled: false })).toEqual({
      ok: false,
      message: "Este telemóvel não tem biometria disponível.",
    });
  });

  it("com biometria mas sem nada registado, pede para registar", () => {
    const result = canEnable({ hasHardware: true, isEnrolled: false });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("Registe primeiro");
    }
  });

  it("com biometria registada, liga-se", () => {
    expect(canEnable({ hasHardware: true, isEnrolled: true })).toEqual({ ok: true });
  });
});

describe("loadEnabled e saveEnabled", () => {
  it("por omissão está desligado", async () => {
    expect(await loadEnabled(makeStore().store)).toBe(false);
  });

  it("depois de ligado, volta ligado", async () => {
    const { store, data } = makeStore();
    await saveEnabled(store, true);
    expect(data.get(APP_LOCK_KEY)).toBe("1");
    expect(await loadEnabled(store)).toBe(true);
  });

  it("depois de desligado, volta desligado", async () => {
    const { store, data } = makeStore({ [APP_LOCK_KEY]: "1" });
    await saveEnabled(store, false);
    expect(data.get(APP_LOCK_KEY)).toBe("0");
    expect(await loadEnabled(store)).toBe(false);
  });

  it("se a leitura falhar, fica desligado, e se a gravação falhar não lança erro", async () => {
    const broken: KeyValueStore = {
      getItem: async () => {
        throw new Error("armazenamento indisponível");
      },
      setItem: async () => {
        throw new Error("armazenamento indisponível");
      },
    };
    expect(await loadEnabled(broken)).toBe(false);
    await expect(saveEnabled(broken, true)).resolves.toBeUndefined();
  });
});
