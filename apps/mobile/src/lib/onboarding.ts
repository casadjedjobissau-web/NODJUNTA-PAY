import type { KeyValueStore } from "./device";

export const WELCOME_KEY = "nodjunta.welcome_seen";

export async function hasSeenWelcome(store: KeyValueStore): Promise<boolean> {
  try {
    return (await store.getItem(WELCOME_KEY)) === "1";
  } catch {
    return false;
  }
}

// Se não conseguir gravar, o único efeito é as boas-vindas aparecerem outra vez.
export async function markWelcomeSeen(store: KeyValueStore): Promise<void> {
  try {
    await store.setItem(WELCOME_KEY, "1");
  } catch {
    return;
  }
}
