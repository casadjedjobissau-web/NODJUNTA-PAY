import { describe, expect, it } from "vitest";
import { PALETTE_KEYS, buildBand, pointsToString, starPoints } from "./patterns";

describe("buildBand", () => {
  it("calcula o número de módulos e as dimensões", () => {
    const band = buildBand(100, 20);
    expect(band.tiles).toBe(5);
    expect(band.width).toBe(100);
    expect(band.height).toBe(20);
  });

  it("arredonda a largura para cima ao módulo seguinte", () => {
    const band = buildBand(95, 20);
    expect(band.tiles).toBe(5);
    expect(band.width).toBe(100);
  });

  it("repete os quatro motivos por ordem (losango 2, riscas 4, losango invertido 2, xadrez 4)", () => {
    expect(buildBand(100, 20).shapes).toHaveLength(14);
    expect(buildBand(80, 20).shapes).toHaveLength(12);
  });

  it("todas as formas ficam dentro da faixa", () => {
    const band = buildBand(137, 24);
    for (const shape of band.shapes) {
      if (shape.kind === "rect") {
        expect(shape.x).toBeGreaterThanOrEqual(0);
        expect(shape.y).toBeGreaterThanOrEqual(0);
        expect(shape.x + shape.width).toBeLessThanOrEqual(band.width + 0.01);
        expect(shape.y + shape.height).toBeLessThanOrEqual(band.height + 0.01);
      } else {
        for (const pair of shape.points.split(" ")) {
          const [x, y] = pair.split(",").map(Number);
          expect(x).toBeGreaterThanOrEqual(0);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(band.width + 0.01);
          expect(y).toBeLessThanOrEqual(band.height + 0.01);
        }
      }
    }
  });

  it("é determinística", () => {
    expect(JSON.stringify(buildBand(120, 16))).toBe(JSON.stringify(buildBand(120, 16)));
  });

  it("usa apenas cores da paleta da marca", () => {
    for (const shape of buildBand(160, 16).shapes) {
      expect(PALETTE_KEYS).toContain(shape.color);
    }
  });

  it("recusa dimensões inválidas", () => {
    expect(() => buildBand(0, 20)).toThrow();
    expect(() => buildBand(100, 0)).toThrow();
    expect(() => buildBand(Number.NaN, 20)).toThrow();
    expect(() => buildBand(100, -5)).toThrow();
  });
});

describe("starPoints", () => {
  it("devolve 10 pontos", () => {
    expect(starPoints(50, 50, 30, 12)).toHaveLength(10);
  });

  it("a primeira ponta fica virada para cima", () => {
    const first = starPoints(50, 50, 30, 12)[0];
    expect(first?.x).toBeCloseTo(50, 5);
    expect(first?.y).toBeCloseTo(20, 5);
  });

  it("alterna entre o raio exterior e o interior", () => {
    const points = starPoints(50, 50, 30, 12);
    points.forEach((point, index) => {
      const distance = Math.hypot(point.x - 50, point.y - 50);
      expect(distance).toBeCloseTo(index % 2 === 0 ? 30 : 12, 5);
    });
  });

  it("recusa raios inválidos", () => {
    expect(() => starPoints(0, 0, 10, 10)).toThrow();
    expect(() => starPoints(0, 0, 10, 12)).toThrow();
    expect(() => starPoints(0, 0, 0, 0)).toThrow();
  });
});

describe("pointsToString", () => {
  it("junta os pontos arredondados a duas casas", () => {
    expect(pointsToString([{ x: 1.234, y: 2 }, { x: 3, y: 4.5678 }])).toBe("1.23,2 3,4.57");
  });
});
