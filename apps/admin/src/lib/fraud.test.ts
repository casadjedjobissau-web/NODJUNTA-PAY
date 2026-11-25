import { describe, expect, it } from "vitest";
import {
  decisionLabel,
  detailsText,
  operationLabel,
  reviewBlock,
  ruleHelp,
  ruleLabel,
  validateNote,
  type FraudAlertItem,
} from "./fraud";

const ME = "aaaaaaaa-0000-4000-8000-00000000000a";
const USER = "11111111-1111-4111-8111-111111111111";

function alert(overrides: Partial<FraudAlertItem> = {}): FraudAlertItem {
  return {
    id: "a1",
    seq: 1,
    userId: USER,
    fullName: "Ana Gomes",
    phoneMasked: "+245 955 *** 801",
    rule: "velocity",
    decision: "block",
    operation: "transfer",
    amount: 1000,
    details: {},
    status: "open",
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    createdAt: "2026-11-14T10:00:00.000Z",
    ...overrides,
  };
}

describe("textos", () => {
  it("rótulos das regras, das decisões e das operações", () => {
    expect(ruleLabel("velocity")).toBe("Velocidade");
    expect(ruleLabel("cooldown")).toBe("Pausa nos levantamentos");
    expect(ruleLabel("large_amount")).toBe("Montante elevado");
    expect(ruleLabel("nova_regra")).toBe("nova_regra");
    expect(decisionLabel("block")).toBe("Bloqueou a operação");
    expect(decisionLabel("flag")).toContain("só alerta");
    expect(operationLabel("merchant_payment")).toBe("Pagamento a comerciante");
    expect(operationLabel("withdrawal")).toBe("Levantamento");
    expect(operationLabel("estranha")).toBe("estranha");
  });

  it("cada regra conhecida tem uma sugestão e uma regra desconhecida não tem", () => {
    for (const rule of ["velocity", "cooldown", "large_amount"]) {
      expect(ruleHelp(rule).length).toBeGreaterThan(20);
    }
    expect(ruleHelp("nova_regra")).toBe("");
  });
});

describe("detailsText", () => {
  it("velocidade", () => {
    expect(detailsText("velocity", { count: 11, max: 10, window_minutes: 10 })).toBe(
      "11 operações em 10 min (limite 10)",
    );
  });

  it("pausa nos levantamentos", () => {
    expect(detailsText("cooldown", { hours: 24 })).toBe("Pausa de 24 h");
  });

  it("montante elevado", () => {
    expect(detailsText("large_amount", { threshold: 500000 })).toBe("Acima do limiar de 500000");
  });

  it("valores em falta, de outro tipo, ou regras desconhecidas devolvem vazio", () => {
    expect(detailsText("velocity", { count: 11 })).toBe("");
    expect(detailsText("cooldown", { hours: "24" })).toBe("");
    expect(detailsText("large_amount", {})).toBe("");
    expect(detailsText("nova_regra", { x: 1 })).toBe("");
  });
});

describe("reviewBlock", () => {
  it("um alerta aberto de outra conta pode ser tratado", () => {
    expect(reviewBlock(alert(), ME)).toBeNull();
  });

  it("um alerta já tratado não se trata outra vez", () => {
    expect(reviewBlock(alert({ status: "reviewed" }), ME)).toBe("O alerta já foi tratado.");
  });

  it("ninguém trata alertas da própria conta", () => {
    expect(reviewBlock(alert({ userId: ME }), ME)).toContain("própria conta");
  });
});

describe("validateNote", () => {
  it("a nota é opcional e tem no máximo 300 caracteres", () => {
    expect(validateNote("")).toBeNull();
    expect(validateNote("a".repeat(300))).toBeNull();
    expect(validateNote("a".repeat(301))).toContain("300");
  });
});
