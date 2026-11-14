import { describe, expect, it } from "vitest";
import { TEST_ENV } from "../testing/fakes.js";
import { loadEnv } from "./env.js";

describe("configuração de ambiente (notificações push)", () => {
  it("PUSH_ENABLED é true por omissão", () => {
    expect(loadEnv(TEST_ENV).PUSH_ENABLED).toBe(true);
  });

  it("aceita PUSH_ENABLED=false", () => {
    expect(loadEnv({ ...TEST_ENV, PUSH_ENABLED: "false" }).PUSH_ENABLED).toBe(false);
  });

  it("recusa PUSH_ENABLED com um valor inválido", () => {
    expect(() => loadEnv({ ...TEST_ENV, PUSH_ENABLED: "talvez" })).toThrow();
  });

  it("EXPO_ACCESS_TOKEN é opcional e uma string vazia conta como ausente", () => {
    expect(loadEnv(TEST_ENV).EXPO_ACCESS_TOKEN).toBeUndefined();
    expect(loadEnv({ ...TEST_ENV, EXPO_ACCESS_TOKEN: "" }).EXPO_ACCESS_TOKEN).toBeUndefined();
  });

  it("recusa um EXPO_ACCESS_TOKEN demasiado curto", () => {
    expect(() => loadEnv({ ...TEST_ENV, EXPO_ACCESS_TOKEN: "abc" })).toThrow();
  });

  it("aceita um EXPO_ACCESS_TOKEN válido", () => {
    expect(loadEnv({ ...TEST_ENV, EXPO_ACCESS_TOKEN: "token-de-teste-123" }).EXPO_ACCESS_TOKEN).toBe(
      "token-de-teste-123",
    );
  });
});
