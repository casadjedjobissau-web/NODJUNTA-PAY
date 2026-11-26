import { describe, expect, it } from "vitest";
import { randomPhone, readE2eConfig, strongPassword } from "./harness.js";

const KEYS = {
  E2E_ANON_KEY: "chave-anon-de-teste",
  E2E_SERVICE_ROLE_KEY: "chave-service-de-teste",
};

describe("readE2eConfig", () => {
  it("falta qualquer variável: recusa e diz qual", () => {
    const full = { E2E_SUPABASE_URL: "http://127.0.0.1:54321", ...KEYS };
    for (const name of Object.keys(full)) {
      const partial: Record<string, string | undefined> = { ...full, [name]: "" };
      const result = readE2eConfig(partial);
      expect(result.ok, name).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain(name);
      }
    }
    expect(readE2eConfig({}).ok).toBe(false);
  });

  it("aceita um Supabase local e apara os espaços", () => {
    const result = readE2eConfig({
      E2E_SUPABASE_URL: " http://127.0.0.1:54321 ",
      E2E_ANON_KEY: " chave-anon ",
      E2E_SERVICE_ROLE_KEY: " chave-service ",
    });

    expect(result).toEqual({
      ok: true,
      config: { url: "http://127.0.0.1:54321", anonKey: "chave-anon", serviceKey: "chave-service" },
    });
  });

  it("localhost também conta como local", () => {
    expect(readE2eConfig({ E2E_SUPABASE_URL: "http://localhost:54321", ...KEYS }).ok).toBe(true);
  });

  it("um endereço que não é válido é recusado", () => {
    const result = readE2eConfig({ E2E_SUPABASE_URL: "isto-nao-e-um-url", ...KEYS });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("endereço válido");
    }
  });

  it("um Supabase que não é local é recusado, e só aceite com a confirmação expressa", () => {
    const remote = { E2E_SUPABASE_URL: "https://abcdefgh.supabase.co", ...KEYS };

    const refused = readE2eConfig(remote);
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.reason).toContain("não é um Supabase local");
    }

    expect(readE2eConfig({ ...remote, E2E_ALLOW_REMOTE: "yes" }).ok).toBe(true);
    expect(readE2eConfig({ ...remote, E2E_ALLOW_REMOTE: "true" }).ok).toBe(false);
    expect(readE2eConfig({ ...remote, E2E_ALLOW_REMOTE: "YES" }).ok).toBe(false);
  });
});

describe("dados de teste", () => {
  it("o telemóvel tem sempre o formato +245 e 9 dígitos (sem o +) e não se repete", () => {
    const phones = Array.from({ length: 50 }, () => randomPhone());

    for (const phone of phones) {
      expect(phone).toMatch(/^2459[0-9]{8}$/);
    }
    expect(new Set(phones).size).toBe(50);
  });

  it("a palavra-passe é longa, mistura caracteres e muda a cada vez", () => {
    const first = strongPassword();
    const second = strongPassword();

    expect(first.length).toBeGreaterThanOrEqual(16);
    expect(first).toMatch(/[A-Z]/);
    expect(first).toMatch(/[a-z]/);
    expect(first).toMatch(/[0-9]/);
    expect(first).toMatch(/[^A-Za-z0-9]/);
    expect(first).not.toBe(second);
  });
});
