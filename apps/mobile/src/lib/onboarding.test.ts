import { describe, expect, it } from "vitest";
import type { KeyValueStore } from "./device";
import { WELCOME_KEY, hasSeenWelcome, markWelcomeSeen } from "./onboarding";

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

describe("onboarding", () => {
  it("sem nada guardado, as boas-vindas ainda não foram vistas", async () => {
    const { store } = makeStore();
    expect(await hasSeenWelcome(store)).toBe(false);
  });

  it("depois de marcadas, passam a vistas", async () => {
    const { store } = makeStore();

    await markWelcomeSeen(store);

    expect(await hasSeenWelcome(store)).toBe(true);
  });

  it("grava o valor 1 na chave certa", async () => {
    const { store, data } = makeStore();

    await markWelcomeSeen(store);

    expect(data.get(WELCOME_KEY)).toBe("1");
    expect(WELCOME_KEY).toBe("nodjunta.welcome_seen");
  });

  it("um valor guardado diferente de 1 conta como não visto", async () => {
    for (const value of ["0", "", "true", "sim"]) {
      const { store } = makeStore({ [WELCOME_KEY]: value });
      expect(await hasSeenWelcome(store)).toBe(false);
    }
  });

  it("se a leitura falhar, conta como não visto", async () => {
    const store: KeyValueStore = {
      getItem: async () => {
        throw new Error("armazenamento indisponível");
      },
      setItem: async () => undefined,
    };

    expect(await hasSeenWelcome(store)).toBe(false);
  });

  it("se a gravação falhar, não lança erro", async () => {
    const store: KeyValueStore = {
      getItem: async () => null,
      setItem: async () => {
        throw new Error("armazenamento indisponível");
      },
    };

    await expect(markWelcomeSeen(store)).resolves.toBeUndefined();
  });
});
