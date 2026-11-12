import { describe, expect, it } from "vitest";
import { signPayload, verifySignature } from "./webhook-signature.js";

const SECRET = "segredo-de-teste-com-mais-de-32-caracteres";
const NOW = 1_800_000_000;
const TS = String(NOW);
const BODY = Buffer.from('{"id":"evt-00000001","type":"deposit.completed","providerRef":"ref-1"}');

function base(overrides: Partial<Parameters<typeof verifySignature>[0]> = {}) {
  return {
    secret: SECRET,
    timestampHeader: TS,
    signatureHeader: signPayload(SECRET, TS, BODY),
    rawBody: BODY,
    nowSeconds: NOW,
    ...overrides,
  };
}

describe("verifySignature", () => {
  it("aceita uma assinatura válida", () => {
    expect(verifySignature(base())).toBe(true);
  });

  it("rejeita segredo errado", () => {
    expect(verifySignature(base({ secret: "outro-segredo-completamente-diferente-123" }))).toBe(false);
  });

  it("rejeita corpo alterado", () => {
    expect(verifySignature(base({ rawBody: Buffer.from('{"id":"evt-00000001","type":"x"}') }))).toBe(false);
  });

  it("rejeita timestamp fora da tolerância", () => {
    expect(verifySignature(base({ nowSeconds: NOW + 301 }))).toBe(false);
    expect(verifySignature(base({ nowSeconds: NOW - 301 }))).toBe(false);
    expect(verifySignature(base({ nowSeconds: NOW + 300 }))).toBe(true);
  });

  it("rejeita cabeçalhos em falta", () => {
    expect(verifySignature(base({ timestampHeader: undefined }))).toBe(false);
    expect(verifySignature(base({ signatureHeader: undefined }))).toBe(false);
  });

  it("rejeita assinatura mal formada", () => {
    expect(verifySignature(base({ signatureHeader: "abc123" }))).toBe(false);
    expect(verifySignature(base({ signatureHeader: "z".repeat(64) }))).toBe(false);
  });
});
