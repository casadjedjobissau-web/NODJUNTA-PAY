export const DEVICE_KEY = "nodjunta.device_id";

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

// Mesma regra da API: 8 a 128 caracteres entre letras, números, ponto, hífen e sublinhado.
export function isValidDeviceId(value: string): boolean {
  return /^[A-Za-z0-9._-]{8,128}$/.test(value);
}

export function devicePlatform(os: string): "ios" | "android" | null {
  if (os === "ios" || os === "android") {
    return os;
  }
  return null;
}

// Identificador aleatório criado na primeira utilização e guardado no armazenamento seguro.
export async function getOrCreateDeviceId(store: KeyValueStore, generate: () => string): Promise<string> {
  const stored = await store.getItem(DEVICE_KEY);
  if (stored !== null && isValidDeviceId(stored)) {
    return stored;
  }
  const created = generate();
  if (!isValidDeviceId(created)) {
    throw new Error("Identificador de dispositivo inválido");
  }
  await store.setItem(DEVICE_KEY, created);
  return created;
}
