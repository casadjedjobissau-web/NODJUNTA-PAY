import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";
import { artAccessibility, sceneColors, type SceneVariant } from "./scene-colors";
import { palette } from "./tokens";

const VARIANTS: SceneVariant[] = ["dark", "light"];

describe("sceneColors", () => {
  it.each(VARIANTS)("%s: todas as cores são hexadecimais válidas", (variant) => {
    for (const value of Object.values(sceneColors(variant))) {
      expect(value).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("a variante escura tem céu preto da marca e a clara tem céu verde suave", () => {
    expect(sceneColors("dark").sky).toBe(palette.ink);
    expect(sceneColors("light").sky).toBe(palette.greenSoft);
  });

  it.each(VARIANTS)("%s: estrela, pedra, tronco e copa distinguem-se do céu (contraste mínimo 3)", (variant) => {
    const colors = sceneColors(variant);
    for (const element of [colors.star, colors.stone, colors.trunk, colors.canopy]) {
      expect(contrastRatio(element, colors.sky)).toBeGreaterThanOrEqual(3);
    }
  });

  it("usa só cores da paleta da marca", () => {
    const allowed = new Set<string>(Object.values(palette));
    for (const variant of VARIANTS) {
      for (const value of Object.values(sceneColors(variant))) {
        expect(allowed.has(value)).toBe(true);
      }
    }
  });
});

describe("artAccessibility", () => {
  it("sem etiqueta, esconde a ilustração dos leitores de ecrã", () => {
    expect(artAccessibility()).toEqual({
      accessibilityElementsHidden: true,
      importantForAccessibility: "no-hide-descendants",
    });
  });

  it("com etiqueta, anuncia-a como imagem", () => {
    expect(artAccessibility("Mangal ao entardecer")).toEqual({
      accessibilityRole: "image",
      accessibilityLabel: "Mangal ao entardecer",
    });
  });
});
