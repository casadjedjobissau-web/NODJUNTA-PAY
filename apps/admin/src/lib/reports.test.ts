import { describe, expect, it } from "vitest";
import { csvPath, defaultRange, formatDay, ledgerStatus, toIsoDate, validateRange } from "./reports";

const TODAY = new Date("2026-11-14T15:30:00.000Z");

describe("defaultRange", () => {
  it("devolve os últimos 30 dias até hoje, em UTC", () => {
    expect(defaultRange(TODAY)).toEqual({ from: "2026-10-16", to: "2026-11-14" });
  });

  it("o dia conta em UTC, não na hora local", () => {
    expect(toIsoDate(new Date("2026-11-14T23:59:59.000Z"))).toBe("2026-11-14");
    expect(defaultRange(new Date("2026-11-14T23:59:59.000Z")).to).toBe("2026-11-14");
  });
});

describe("validateRange", () => {
  it("aceita um intervalo válido, de um só dia e de exatamente 92 dias", () => {
    expect(validateRange("2026-11-01", "2026-11-10", TODAY)).toBeNull();
    expect(validateRange("2026-11-14", "2026-11-14", TODAY)).toBeNull();
    expect(validateRange("2026-08-15", "2026-11-14", TODAY)).toBeNull();
  });

  it("recusa datas inválidas", () => {
    for (const [from, to] of [
      ["", "2026-11-10"],
      ["2026-11-01", ""],
      ["01/11/2026", "2026-11-10"],
      ["2026-02-30", "2026-11-10"],
    ] as const) {
      expect(validateRange(from, to, TODAY)).toBe("Escolha datas válidas.");
    }
  });

  it("recusa uma data final no futuro", () => {
    expect(validateRange("2026-11-01", "2026-11-15", TODAY)).toBe("A data final não pode estar no futuro.");
  });

  it("recusa a data inicial depois da final", () => {
    expect(validateRange("2026-11-10", "2026-11-05", TODAY)).toBe("A data inicial não pode ser posterior à final.");
  });

  it("recusa 93 dias", () => {
    expect(validateRange("2026-08-14", "2026-11-14", TODAY)).toBe("O intervalo máximo é de 92 dias.");
  });
});

describe("ledgerStatus", () => {
  it("zero é equilibrado", () => {
    expect(ledgerStatus(0)).toEqual({ ok: true, label: "Equilibrado (0)" });
  });

  it("qualquer diferença, positiva ou negativa, pede investigação imediata", () => {
    const positive = ledgerStatus(1500);
    const negative = ledgerStatus(-200);
    expect(positive.ok).toBe(false);
    expect(positive.label).toContain("1\u00A0500");
    expect(positive.label).toContain("Investigue de imediato");
    expect(negative.ok).toBe(false);
    expect(negative.label).toContain("-200");
  });
});

describe("csvPath e formatDay", () => {
  it("o caminho da exportação leva as duas datas", () => {
    expect(csvPath("2026-11-01", "2026-11-10")).toBe("/admin/v1/reports/daily.csv?from=2026-11-01&to=2026-11-10");
  });

  it("formatDay passa a dd/mm/aaaa e deixa o resto como está", () => {
    expect(formatDay("2026-11-14")).toBe("14/11/2026");
    expect(formatDay("ontem")).toBe("ontem");
  });
});
