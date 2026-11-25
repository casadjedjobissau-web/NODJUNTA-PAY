import { describe, expect, it } from "vitest";
import {
  containsLongNumber,
  decideBlock,
  statusLabel,
  statusTone,
  validateCreate,
  validateDecision,
  type PhoneChangeItem,
} from "./phone-change";

const ME = "aaaaaaaa-0000-4000-8000-00000000000a";
const OTHER = "bbbbbbbb-0000-4000-8000-00000000000b";
const USER = "11111111-1111-4111-8111-111111111111";

function item(overrides: Partial<PhoneChangeItem> = {}): PhoneChangeItem {
  return {
    id: "p1",
    seq: 1,
    userId: USER,
    fullName: "Ana Gomes",
    oldPhoneMasked: "+245 955 *** 701",
    newPhone: "+245955000799",
    reason: "Perdeu o cartão SIM",
    evidenceNote: "Identidade verificada em videochamada de 14/11/2026.",
    status: "pending",
    createdBy: OTHER,
    decidedBy: null,
    decisionReason: null,
    createdAt: "2026-11-14T10:00:00.000Z",
    decidedAt: null,
    ...overrides,
  };
}

const VALID = {
  newPhoneText: "955 000 799",
  reason: "  Perdeu o cartão SIM  ",
  evidence: "  Identidade verificada em videochamada de 14/11/2026.  ",
};

describe("estados", () => {
  it("texto e cor de cada estado", () => {
    expect(statusLabel("pending")).toBe("Pendente");
    expect(statusLabel("approved")).toBe("Aprovado");
    expect(statusLabel("rejected")).toBe("Recusado");
    expect(statusTone("pending")).toBe("warn");
    expect(statusTone("approved")).toBe("ok");
    expect(statusTone("rejected")).toBe("bad");
  });
});

describe("containsLongNumber", () => {
  it("apanha 6 ou mais dígitos seguidos, mesmo com espaços, pontos ou hífenes pelo meio", () => {
    expect(containsLongNumber("BI 1234567")).toBe(true);
    expect(containsLongNumber("telefone 955 000 799")).toBe(true);
    expect(containsLongNumber("n.º 123.456")).toBe(true);
    expect(containsLongNumber("123-456")).toBe(true);
  });

  it("deixa passar datas com barras e números curtos", () => {
    expect(containsLongNumber("videochamada de 14/11/2026 às 10:30")).toBe(false);
    expect(containsLongNumber("12345")).toBe(false);
    expect(containsLongNumber("sem números")).toBe(false);
  });
});

describe("validateCreate", () => {
  it("aceita um pedido válido, normaliza o número e apara os textos", () => {
    expect(validateCreate(VALID)).toEqual({
      ok: true,
      value: {
        newPhone: "+245955000799",
        reason: "Perdeu o cartão SIM",
        evidence: "Identidade verificada em videochamada de 14/11/2026.",
      },
    });
  });

  it("recusa um número que não é +245 e 9 dígitos", () => {
    for (const newPhoneText of ["", "12345", "+351912345678"]) {
      const result = validateCreate({ ...VALID, newPhoneText });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.newPhone).toContain("Número inválido");
      }
    }
  });

  it("recusa um motivo curto e um motivo longo", () => {
    expect(validateCreate({ ...VALID, reason: "ab" }).ok).toBe(false);
    expect(validateCreate({ ...VALID, reason: "a".repeat(301) }).ok).toBe(false);
    expect(validateCreate({ ...VALID, reason: "a".repeat(300) }).ok).toBe(true);
  });

  it("recusa uma nota de prova curta ou longa", () => {
    expect(validateCreate({ ...VALID, evidence: "curta" }).ok).toBe(false);
    expect(validateCreate({ ...VALID, evidence: "a".repeat(501) }).ok).toBe(false);
  });

  it("recusa uma nota de prova com um número de documento", () => {
    const result = validateCreate({ ...VALID, evidence: "Verificado com o BI número 1234567 em videochamada." });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.evidence).toContain("número de documento");
    }
  });

  it("devolve todos os erros de uma vez", () => {
    const result = validateCreate({ newPhoneText: "", reason: "", evidence: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual(["evidence", "newPhone", "reason"]);
    }
  });
});

describe("decideBlock", () => {
  it("um pedido de outra pessoa, pendente, pode ser decidido", () => {
    expect(decideBlock(item(), ME)).toBeNull();
  });

  it("quem abriu o pedido não o pode decidir", () => {
    expect(decideBlock(item({ createdBy: ME }), ME)).toContain("Quem abriu o pedido");
  });

  it("ninguém decide uma troca da própria conta", () => {
    expect(decideBlock(item({ userId: ME }), ME)).toContain("própria conta");
  });

  it("um pedido já decidido não se decide outra vez", () => {
    expect(decideBlock(item({ status: "approved" }), ME)).toBe("O pedido já foi decidido.");
    expect(decideBlock(item({ status: "rejected" }), ME)).toBe("O pedido já foi decidido.");
  });
});

describe("validateDecision", () => {
  it("aprovar não exige motivo", () => {
    expect(validateDecision(true, "")).toBeNull();
  });

  it("recusar exige motivo", () => {
    expect(validateDecision(false, "")).toBe("Indique o motivo da recusa.");
    expect(validateDecision(false, "   ")).toBe("Indique o motivo da recusa.");
    expect(validateDecision(false, "Identidade não confirmada.")).toBeNull();
  });

  it("o motivo tem no máximo 300 caracteres", () => {
    expect(validateDecision(false, "a".repeat(301))).toContain("300");
    expect(validateDecision(true, "a".repeat(301))).toContain("300");
  });
});
