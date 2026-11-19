import { describe, expect, it } from "vitest";
import { TEST_ENV } from "../testing/fakes.js";
import { loadEnv } from "./env.js";

describe("configuração de ambiente (MFA dos administradores)", () => {
  it("ADMIN_MFA é on por omissão", () => {
    expect(loadEnv(TEST_ENV).ADMIN_MFA).toBe(true);
  });

  it("aceita ADMIN_MFA=on explicitamente", () => {
    expect(loadEnv({ ...TEST_ENV, ADMIN_MFA: "on" }).ADMIN_MFA).toBe(true);
  });

  it("aceita ADMIN_MFA=off fora de produção", () => {
    expect(loadEnv({ ...TEST_ENV, ADMIN_MFA: "off" }).ADMIN_MFA).toBe(false);
    expect(loadEnv({ ...TEST_ENV, NODE_ENV: "staging", ADMIN_MFA: "off" }).ADMIN_MFA).toBe(false);
  });

  it("recusa ADMIN_MFA=off em produção", () => {
    expect(() => loadEnv({ ...TEST_ENV, NODE_ENV: "production", ADMIN_MFA: "off" })).toThrow(
      "ADMIN_MFA não pode ser off em produção",
    );
  });

  it("aceita produção com o MFA ligado por omissão", () => {
    const env = loadEnv({ ...TEST_ENV, NODE_ENV: "production" });
    expect(env.ADMIN_MFA).toBe(true);
    expect(env.NODE_ENV).toBe("production");
  });

  it("recusa valores inválidos", () => {
    expect(() => loadEnv({ ...TEST_ENV, ADMIN_MFA: "talvez" })).toThrow();
    expect(() => loadEnv({ ...TEST_ENV, ADMIN_MFA: "true" })).toThrow();
  });
});
