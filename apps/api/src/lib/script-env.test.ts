import { describe, expect, it } from "vitest";
import { loadScriptEnv } from "./script-env.js";

const VALID = {
  SUPABASE_URL: "http://localhost:54321",
  SUPABASE_SERVICE_ROLE_KEY: "placeholder-apenas-para-testes-123456",
};

describe("loadScriptEnv", () => {
  it("aceita uma configuração válida e devolve só os dois campos", () => {
    expect(loadScriptEnv({ ...VALID, PORT: "3000", OUTRA: "x" })).toEqual(VALID);
  });

  it("não exige a pimenta do PIN nem as outras variáveis da API", () => {
    expect(() => loadScriptEnv(VALID)).not.toThrow();
  });

  it("recusa sem SUPABASE_URL", () => {
    expect(() => loadScriptEnv({ SUPABASE_SERVICE_ROLE_KEY: VALID.SUPABASE_SERVICE_ROLE_KEY })).toThrow();
  });

  it("recusa um SUPABASE_URL que não é um endereço", () => {
    expect(() => loadScriptEnv({ ...VALID, SUPABASE_URL: "isto-nao-e-um-url" })).toThrow();
  });

  it("recusa uma chave demasiado curta", () => {
    expect(() => loadScriptEnv({ ...VALID, SUPABASE_SERVICE_ROLE_KEY: "curta" })).toThrow();
  });

  it("a mensagem de erro começa por 'Configuração inválida' e indica a variável em falta", () => {
    const error = (() => {
      try {
        loadScriptEnv({ SUPABASE_URL: VALID.SUPABASE_URL });
        return null;
      } catch (e) {
        return e as Error;
      }
    })();

    expect(error).not.toBeNull();
    expect(error?.message.startsWith("Configuração inválida")).toBe(true);
    expect(error?.message).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});
