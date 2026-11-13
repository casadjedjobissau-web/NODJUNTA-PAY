import { describe, expect, it } from "vitest";
import { crenellations, hillPath, mangroveRoots, wavePath } from "./scenes";

describe("crenellations", () => {
  it("cabem 5 ameias de 10 com intervalos de 10 em 100 de largura", () => {
    const rects = crenellations(0, 50, 100, 10, 10, 6);
    expect(rects).toHaveLength(5);
    expect(rects.map((rect) => rect.x)).toEqual([0, 20, 40, 60, 80]);
  });

  it("as ameias assentam sobre a linha y", () => {
    for (const rect of crenellations(0, 50, 100, 10, 10, 6)) {
      expect(rect.y).toBe(44);
      expect(rect.y + rect.height).toBe(50);
    }
  });

  it("a última ameia nunca passa da largura", () => {
    const rects = crenellations(10, 0, 110, 10, 10, 4);
    const last = rects[rects.length - 1];
    expect(last).toBeDefined();
    expect((last?.x ?? 0) + (last?.width ?? 0)).toBeLessThanOrEqual(120);
  });

  it("uma ameia a mais quando a largura é exata", () => {
    expect(crenellations(0, 0, 110, 10, 10, 4)).toHaveLength(6);
  });

  it("recusa dimensões inválidas", () => {
    expect(() => crenellations(0, 0, 0, 10, 10, 4)).toThrow();
    expect(() => crenellations(0, 0, 100, 0, 10, 4)).toThrow();
    expect(() => crenellations(0, 0, 100, 10, -1, 4)).toThrow();
    expect(() => crenellations(0, 0, 100, 10, 10, 0)).toThrow();
  });
});

describe("wavePath", () => {
  it("começa em M0 e tem um segmento Q por meio comprimento de onda", () => {
    const path = wavePath(100, 50, 5, 20);
    expect(path.startsWith("M0 50")).toBe(true);
    expect(path.match(/Q/g)).toHaveLength(10);
  });

  it("alterna a curvatura acima e abaixo da linha de base", () => {
    const path = wavePath(40, 50, 5, 20);
    expect(path).toContain("Q5 45 10 50");
    expect(path).toContain("Q15 55 20 50");
  });

  it("arredonda a largura para cima ao segmento seguinte", () => {
    expect(wavePath(25, 0, 3, 20).match(/Q/g)).toHaveLength(3);
  });

  it("recusa dimensões inválidas", () => {
    expect(() => wavePath(0, 50, 5, 20)).toThrow();
    expect(() => wavePath(100, 50, 5, 0)).toThrow();
    expect(() => wavePath(100, Number.NaN, 5, 20)).toThrow();
  });
});

describe("hillPath", () => {
  it("a base vai de cx-largura/2 a cx+largura/2 e a curva sobe para o dobro da altura", () => {
    expect(hillPath(100, 120, 60, 20)).toBe("M70 120 Q100 80 130 120 Z");
  });

  it("recusa dimensões inválidas", () => {
    expect(() => hillPath(100, 120, 0, 20)).toThrow();
    expect(() => hillPath(100, 120, 60, -1)).toThrow();
  });
});

describe("mangroveRoots", () => {
  it("devolve o número de raízes pedido", () => {
    expect(mangroveRoots(100, 120, 5, 40, 30)).toHaveLength(5);
  });

  it("todas as raízes terminam no chão e partem da altura do tronco", () => {
    for (const root of mangroveRoots(100, 120, 4, 40, 30)) {
      expect(root.y2).toBe(120);
      expect(root.y1).toBe(90);
    }
  });

  it("é simétrica em torno do tronco com um número ímpar de raízes", () => {
    const roots = mangroveRoots(100, 120, 3, 40, 30);
    expect(roots.map((root) => root.x2)).toEqual([80, 100, 120]);
    expect(roots[1]?.x1).toBe(100);
  });

  it("uma só raiz fica no centro", () => {
    const roots = mangroveRoots(100, 120, 1, 40, 30);
    expect(roots[0]?.x2).toBe(100);
  });

  it("recusa parâmetros inválidos", () => {
    expect(() => mangroveRoots(100, 120, 0, 40, 30)).toThrow();
    expect(() => mangroveRoots(100, 120, 2.5, 40, 30)).toThrow();
    expect(() => mangroveRoots(100, 120, 3, 0, 30)).toThrow();
  });
});
