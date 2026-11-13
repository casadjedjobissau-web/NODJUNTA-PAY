import { describe, expect, it } from "vitest";
import { contrastRatio, hexToRgb, luminance, meetsAA } from "./contrast";
import { colors, palette, textPairs } from "./tokens";

describe("contraste", () => {
  it("hexToRgb lê cores válidas e recusa as inválidas", () => {
    expect(hexToRgb("#16A765")).toEqual([22, 167, 101]);
    expect(hexToRgb("#ffffff")).toEqual([255, 255, 255]);
    expect(() => hexToRgb("16A765")).toThrow();
    expect(() => hexToRgb("#FFF")).toThrow();
  });

  it("preto sobre branco dá 21 e a mesma cor dá 1", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
    expect(contrastRatio(palette.green, palette.green)).toBeCloseTo(1, 5);
  });

  it("o contraste é simétrico", () => {
    expect(contrastRatio(palette.ink, palette.green)).toBeCloseTo(contrastRatio(palette.green, palette.ink), 10);
  });

  it("a luminância do branco é 1 e a do preto é 0", () => {
    expect(luminance("#FFFFFF")).toBeCloseTo(1, 5);
    expect(luminance("#000000")).toBeCloseTo(0, 5);
  });

  it("branco sobre o verde de marca NÃO serve para texto normal, mas serve para texto grande", () => {
    const ratio = contrastRatio(palette.white, palette.green);
    expect(ratio).toBeGreaterThanOrEqual(3);
    expect(ratio).toBeLessThan(4.5);
    expect(meetsAA(palette.white, palette.green)).toBe(false);
    expect(meetsAA(palette.white, palette.green, true)).toBe(true);
  });

  it("preto da marca sobre o verde de marca cumpre o contraste de texto normal", () => {
    expect(contrastRatio(palette.ink, palette.green)).toBeGreaterThanOrEqual(4.5);
  });

  describe("pares de texto aprovados", () => {
    it.each(textPairs.map((pair) => [pair.name, pair] as const))("%s", (_name, pair) => {
      expect(contrastRatio(pair.fg, pair.bg)).toBeGreaterThanOrEqual(pair.min);
    });
  });

  it("a lista de pares aprovados não tem nomes repetidos", () => {
    const names = textPairs.map((pair) => pair.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("os tokens principais usam as cores obrigatórias da marca", () => {
    expect(palette.green).toBe("#16A765");
    expect(palette.ink).toBe("#101820");
    expect(palette.white).toBe("#FFFFFF");
    expect(palette.blue).toBe("#1769D2");
    expect(colors.brand).toBe(palette.green);
    expect(colors.link).toBe(palette.blue);
  });
});
