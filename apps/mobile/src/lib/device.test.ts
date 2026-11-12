import { describe, expect, it } from "vitest";
import { DEVICE_KEY, devicePlatform, getOrCreateDeviceId, isValidDeviceId } from "./device";

function makeStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    store: {
      getItem: async (key: string) => data.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        data.set(key, value);
      },
    },
  };
}

const UUID = "123e4567-e89b-42d3-a456-426614174000";

describe("device", () => {
  it("isValidDeviceId aceita UUIDs e rejeita valores inválidos", () => {
    expect(isValidDeviceId(UUID)).toBe(true);
    expect(isValidDeviceId("curto")).toBe(false);
    expect(isValidDeviceId("tem espaços no meio")).toBe(false);
    expect(isValidDeviceId("a".repeat(129))).toBe(false);
  });

  it("devicePlatform só aceita ios e android", () => {
    expect(devicePlatform("ios")).toBe("ios");
    expect(devicePlatform("android")).toBe("android");
    expect(devicePlatform("web")).toBeNull();
  });

  it("cria e guarda um identificador quando não existe nenhum", async () => {
    const { store, data } = makeStore();
    const id = await getOrCreateDeviceId(store, () => UUID);
    expect(id).toBe(UUID);
    expect(data.get(DEVICE_KEY)).toBe(UUID);
  });

  it("reutiliza o identificador já guardado", async () => {
    const { store } = makeStore({ [DEVICE_KEY]: "dispositivo-existente-01" });
    const id = await getOrCreateDeviceId(store, () => UUID);
    expect(id).toBe("dispositivo-existente-01");
  });

  it("substitui um identificador guardado que seja inválido", async () => {
    const { store, data } = makeStore({ [DEVICE_KEY]: "x" });
    const id = await getOrCreateDeviceId(store, () => UUID);
    expect(id).toBe(UUID);
    expect(data.get(DEVICE_KEY)).toBe(UUID);
  });
});
