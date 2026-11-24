import { describe, expect, it } from "vitest";
import { MfaError } from "./mfa";
import { MFA_FRIENDLY_NAME, MFA_ISSUER, createMfaApi, type MfaClient } from "./mfa-api";

type Call = { fn: string; params?: unknown };

interface Setup {
  aal?: { currentLevel: string | null; nextLevel: string | null } | "error";
  factors?: Array<{ id: string; status: string }> | "error";
  enrollError?: string;
  challengeError?: string;
  verifyError?: string;
}

function makeClient(setup: Setup = {}) {
  const calls: Call[] = [];
  const client: MfaClient = {
    getAuthenticatorAssuranceLevel: async () => {
      calls.push({ fn: "aal" });
      return setup.aal === "error"
        ? { data: null, error: { message: "falha" } }
        : { data: setup.aal ?? { currentLevel: "aal1", nextLevel: "aal1" }, error: null };
    },
    listFactors: async () => {
      calls.push({ fn: "list" });
      return setup.factors === "error"
        ? { data: null, error: { message: "falha" } }
        : { data: { totp: setup.factors ?? [] }, error: null };
    },
    enroll: async (params) => {
      calls.push({ fn: "enroll", params });
      return setup.enrollError
        ? { data: null, error: { message: setup.enrollError } }
        : { data: { id: "novo", totp: { qr_code: "data:image/svg+xml;utf-8,<svg/>", secret: "ABCD1234", uri: "otpauth://x" } }, error: null };
    },
    challenge: async (params) => {
      calls.push({ fn: "challenge", params });
      return setup.challengeError
        ? { data: null, error: { message: setup.challengeError } }
        : { data: { id: "desafio-1" }, error: null };
    },
    verify: async (params) => {
      calls.push({ fn: "verify", params });
      return setup.verifyError ? { data: null, error: { message: setup.verifyError } } : { data: {}, error: null };
    },
    unenroll: async (params) => {
      calls.push({ fn: "unenroll", params });
      return { data: {}, error: null };
    },
  };
  return { client, calls, names: () => calls.map((call) => call.fn) };
}

describe("status", () => {
  it("aal2 está concluído, sem consultar os autenticadores", async () => {
    const { client, names } = makeClient({ aal: { currentLevel: "aal2", nextLevel: "aal2" } });

    expect(await createMfaApi(client).status()).toEqual({ step: "done" });
    expect(names()).toEqual(["aal"]);
  });

  it("com um autenticador confirmado, pede o código", async () => {
    const { client } = makeClient({ factors: [{ id: "f1", status: "verified" }] });

    expect(await createMfaApi(client).status()).toEqual({ step: "challenge", factorId: "f1" });
  });

  it("sem autenticador confirmado, pede a inscrição", async () => {
    const { client } = makeClient({ factors: [{ id: "f0", status: "unverified" }] });

    expect(await createMfaApi(client).status()).toEqual({ step: "enroll" });
  });

  it("um erro ao ler o nível ou os autenticadores vira MfaError", async () => {
    await expect(createMfaApi(makeClient({ aal: "error" }).client).status()).rejects.toBeInstanceOf(MfaError);
    await expect(createMfaApi(makeClient({ factors: "error" }).client).status()).rejects.toBeInstanceOf(MfaError);
  });
});

describe("startEnroll", () => {
  it("inscreve um autenticador e devolve o QR Code e a chave", async () => {
    const { client, calls } = makeClient();

    const info = await createMfaApi(client).startEnroll();

    expect(info).toEqual({ factorId: "novo", qrCode: "data:image/svg+xml;utf-8,<svg/>", secret: "ABCD1234" });
    expect(calls.find((call) => call.fn === "enroll")?.params).toEqual({
      factorType: "totp",
      friendlyName: MFA_FRIENDLY_NAME,
      issuer: MFA_ISSUER,
    });
  });

  it("remove as inscrições deixadas a meio antes de inscrever", async () => {
    const { client, calls, names } = makeClient({
      factors: [
        { id: "velho-1", status: "unverified" },
        { id: "velho-2", status: "unverified" },
      ],
    });

    await createMfaApi(client).startEnroll();

    const removed = calls.filter((call) => call.fn === "unenroll").map((call) => call.params);
    expect(removed).toEqual([{ factorId: "velho-1" }, { factorId: "velho-2" }]);
    expect(names().indexOf("enroll")).toBeGreaterThan(names().lastIndexOf("unenroll"));
  });

  it("recusa criar outro autenticador quando já existe um confirmado, e não altera nada", async () => {
    const { client, names } = makeClient({
      factors: [
        { id: "f1", status: "verified" },
        { id: "f2", status: "unverified" },
      ],
    });

    await expect(createMfaApi(client).startEnroll()).rejects.toThrow("já tem um autenticador");
    expect(names()).toEqual(["list"]);
  });

  it("um erro na inscrição vira MfaError", async () => {
    const { client } = makeClient({ enrollError: "Request rate limit reached" });

    await expect(createMfaApi(client).startEnroll()).rejects.toThrow("Demasiadas tentativas");
  });

  it("um erro ao listar os autenticadores vira MfaError", async () => {
    await expect(createMfaApi(makeClient({ factors: "error" }).client).startEnroll()).rejects.toBeInstanceOf(MfaError);
  });
});

describe("verify", () => {
  it("cria o desafio e verifica o código com o identificador do desafio", async () => {
    const { client, calls, names } = makeClient();

    await createMfaApi(client).verify("f1", "123456");

    expect(names()).toEqual(["challenge", "verify"]);
    expect(calls[0]?.params).toEqual({ factorId: "f1" });
    expect(calls[1]?.params).toEqual({ factorId: "f1", challengeId: "desafio-1", code: "123456" });
  });

  it("um código que não tem 6 dígitos nem chega ao servidor", async () => {
    const { client, calls } = makeClient();

    await expect(createMfaApi(client).verify("f1", "12345")).rejects.toThrow("6 dígitos");
    expect(calls).toEqual([]);
  });

  it("um código errado dá a mensagem de código incorreto", async () => {
    const { client } = makeClient({ verifyError: "Invalid TOTP code entered" });

    await expect(createMfaApi(client).verify("f1", "123456")).rejects.toThrow("Código incorreto ou expirado");
  });

  it("um erro ao criar o desafio vira MfaError e não tenta verificar", async () => {
    const { client, names } = makeClient({ challengeError: "falha" });

    await expect(createMfaApi(client).verify("f1", "123456")).rejects.toBeInstanceOf(MfaError);
    expect(names()).toEqual(["challenge"]);
  });
});
