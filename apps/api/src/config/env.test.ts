import { describe, expect, it } from "vitest";
import { TEST_ENV } from "../testing/fakes.js";
import { loadEnv } from "./env.js";

describe("configuração de ambiente (PIN e suporte)", () => {
  it("exige PIN_PEPPER", () => {
    const { PIN_PEPPER: _omitted, ...rest } = TEST_ENV;
    expect(() => loadEnv(rest)).toThrow();
  });

  it("recusa PIN_PEPPER com menos de 32 caracteres", () => {
    expect(() => loadEnv({ ...TEST_ENV, PIN_PEPPER: "curto" })).toThrow();
  });

  it("PIN_ENFORCEMENT é on por omissão", () => {
    expect(loadEnv(TEST_ENV).PIN_ENFORCEMENT).toBe(true);
  });

  it("aceita PIN_ENFORCEMENT=off fora de produção", () => {
    expect(loadEnv({ ...TEST_ENV, PIN_ENFORCEMENT: "off" }).PIN_ENFORCEMENT).toBe(false);
  });

  it("recusa PIN_ENFORCEMENT=off em produção", () => {
    expect(() => loadEnv({ ...TEST_ENV, NODE_ENV: "production", PIN_ENFORCEMENT: "off" })).toThrow();
  });

  it("SUPPORT_PHONES tem por omissão os dois números de suporte", () => {
    expect(loadEnv(TEST_ENV).SUPPORT_PHONES).toEqual(["+245956191968", "+245956656700"]);
  });

  it("SUPPORT_PHONES aceita uma lista personalizada com espaços, e a lista vazia", () => {
    expect(loadEnv({ ...TEST_ENV, SUPPORT_PHONES: "+245 956 191 968 , +245956656700" }).SUPPORT_PHONES).toEqual([
      "+245956191968",
      "+245956656700",
    ]);
    expect(loadEnv({ ...TEST_ENV, SUPPORT_PHONES: "" }).SUPPORT_PHONES).toEqual([]);
  });

  it("SUPPORT_PHONES recusa números sem formato internacional", () => {
    expect(() => loadEnv({ ...TEST_ENV, SUPPORT_PHONES: "956191968" })).toThrow();
    expect(() => loadEnv({ ...TEST_ENV, SUPPORT_PHONES: "+245956191968,abc" })).toThrow();
  });
});
