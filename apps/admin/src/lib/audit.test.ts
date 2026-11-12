import { describe, expect, it } from "vitest";
import { actionLabel, shortId, summarizeMetadata } from "./audit";

describe("audit", () => {
  it("dá nomes em português às ações conhecidas", () => {
    expect(actionLabel("KYC_REVIEW")).toBe("Revisão de KYC");
    expect(actionLabel("ADMIN_KYC_DOCUMENTS_VIEW")).toBe("Consulta de documentos KYC");
    expect(actionLabel("ADMIN_USER_LOOKUP")).toBe("Procura de utilizador");
    expect(actionLabel("ADMIN_MERCHANT_STATUS")).toBe("Alteração do estado de comerciante");
    expect(actionLabel("ADMIN_WALLET_FREEZE")).toBe("Carteira congelada");
    expect(actionLabel("ADMIN_WALLET_UNFREEZE")).toBe("Carteira descongelada");
  });

  it("formata as ações de webhook", () => {
    expect(actionLabel("WEBHOOK_DEPOSIT_COMPLETED")).toBe("Webhook: deposit completed");
  });

  it("ações desconhecidas ficam como estão", () => {
    expect(actionLabel("POST /v1/transfers")).toBe("POST /v1/transfers");
  });

  it("shortId mostra os 8 primeiros caracteres", () => {
    expect(shortId("aaaaaaaa-0000-4000-8000-00000000000a")).toBe("aaaaaaaa");
    expect(shortId(null)).toBe("—");
  });

  it("summarizeMetadata devolve texto vazio quando não há dados", () => {
    expect(summarizeMetadata({})).toBe("");
  });

  it("summarizeMetadata mostra JSON curto e corta o longo", () => {
    expect(summarizeMetadata({ status: 201 })).toBe('{"status":201}');
    const long = summarizeMetadata({ texto: "x".repeat(300) }, 50);
    expect(long).toHaveLength(50);
    expect(long.endsWith("…")).toBe(true);
  });
});
