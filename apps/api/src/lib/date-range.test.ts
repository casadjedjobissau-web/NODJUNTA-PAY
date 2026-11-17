import { describe, expect, it } from "vitest";
import { DateRangeError, resolveDateRange } from "./date-range.js";

const TODAY = new Date("2026-11-14T15:30:00.000Z");

function failure(action: () => unknown): Error {
  try {
    action();
  } catch (error) {
    return error as Error;
  }
  throw new Error("esperava que a função lançasse um erro");
}

describe("resolveDateRange", () => {
  it("sem datas devolve os últimos 30 dias até hoje (UTC)", () => {
    expect(resolveDateRange(undefined, undefined, TODAY)).toEqual({ from: "2026-10-16", to: "2026-11-14" });
  });

  it("só com a data final, recua 30 dias a partir dela", () => {
    expect(resolveDateRange(undefined, "2026-11-10", TODAY)).toEqual({ from: "2026-10-12", to: "2026-11-10" });
  });

  it("só com a data inicial, vai até hoje", () => {
    expect(resolveDateRange("2026-11-01", undefined, TODAY)).toEqual({ from: "2026-11-01", to: "2026-11-14" });
  });

  it("aceita um intervalo de um só dia", () => {
    expect(resolveDateRange("2026-11-14", "2026-11-14", TODAY)).toEqual({ from: "2026-11-14", to: "2026-11-14" });
  });

  it("recusa formatos de data inválidos", () => {
    expect(failure(() => resolveDateRange(undefined, "14/11/2026", TODAY))).toBeInstanceOf(DateRangeError);
    expect(failure(() => resolveDateRange("2026-1-5", "2026-11-14", TODAY)).message).toContain("inicial");
    expect(failure(() => resolveDateRange(undefined, "ontem", TODAY)).message).toContain("final");
  });

  it("recusa datas que não existem", () => {
    expect(failure(() => resolveDateRange("2026-02-30", "2026-11-14", TODAY)).message).toContain("inicial");
    expect(failure(() => resolveDateRange(undefined, "2026-13-01", TODAY)).message).toContain("final");
  });

  it("aceita 29 de fevereiro num ano bissexto e recusa-o num ano normal", () => {
    const leapToday = new Date("2028-03-01T10:00:00.000Z");
    expect(resolveDateRange("2028-02-29", "2028-03-01", leapToday)).toEqual({
      from: "2028-02-29",
      to: "2028-03-01",
    });

    const normalToday = new Date("2027-03-01T10:00:00.000Z");
    expect(failure(() => resolveDateRange("2027-02-29", "2027-03-01", normalToday))).toBeInstanceOf(DateRangeError);
  });

  it("recusa uma data final no futuro", () => {
    const error = failure(() => resolveDateRange(undefined, "2026-11-15", TODAY));
    expect(error).toBeInstanceOf(DateRangeError);
    expect(error.message).toContain("futuro");
  });

  it("recusa uma data inicial posterior à final", () => {
    const error = failure(() => resolveDateRange("2026-11-10", "2026-11-05", TODAY));
    expect(error).toBeInstanceOf(DateRangeError);
    expect(error.message).toContain("posterior");
  });

  it("aceita exatamente 92 dias", () => {
    expect(resolveDateRange("2026-08-15", "2026-11-14", TODAY)).toEqual({ from: "2026-08-15", to: "2026-11-14" });
  });

  it("recusa 93 dias", () => {
    const error = failure(() => resolveDateRange("2026-08-14", "2026-11-14", TODAY));
    expect(error).toBeInstanceOf(DateRangeError);
    expect(error.message).toContain("92");
  });

  it("respeita um máximo de dias personalizado", () => {
    expect(resolveDateRange("2026-11-08", "2026-11-14", TODAY, 7)).toEqual({ from: "2026-11-08", to: "2026-11-14" });
    expect(failure(() => resolveDateRange("2026-11-07", "2026-11-14", TODAY, 7)).message).toContain("7");
  });

  it("DateRangeError é um Error com o nome certo", () => {
    const error = new DateRangeError("teste");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("DateRangeError");
    expect(error.message).toBe("teste");
  });
});
