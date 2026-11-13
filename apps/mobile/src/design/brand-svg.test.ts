import { describe, expect, it } from "vitest";
import { adaptiveForegroundSvg, faviconSvg, iconSvg, splashSvg } from "./brand-svg";
import { palette } from "./tokens";

const ALL = [
  ["ícone", iconSvg()],
  ["primeiro plano adaptável", adaptiveForegroundSvg()],
  ["ecrã de arranque", splashSvg()],
  ["favicon", faviconSvg()],
] as const;

describe("brand-svg", () => {
  it.each(ALL)("%s é um SVG completo de 1024 por 1024", (_name, svg) => {
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('width="1024"');
    expect(svg).toContain('height="1024"');
    expect(svg).toContain('viewBox="0 0 100 100"');
    expect(svg.endsWith("</svg>")).toBe(true);
  });

  it.each(ALL)("%s tem a estrela de 10 pontos e três losangos", (_name, svg) => {
    const polygons = svg.match(/<polygon points="([^"]+)"/g) ?? [];
    expect(polygons).toHaveLength(4);
    const star = (polygons[0] ?? "").replace('<polygon points="', "").replace('"', "");
    expect(star.split(" ")).toHaveLength(10);
  });

  it("o ícone é quadrado verde de lado a lado, sem cantos arredondados", () => {
    const svg = iconSvg();
    expect(svg).toContain(`<rect x="0" y="0" width="100" height="100" fill="${palette.green}"/>`);
    expect(svg).not.toContain("rx=");
  });

  it("o primeiro plano adaptável não tem fundo e reduz o conteúdo à zona segura", () => {
    const svg = adaptiveForegroundSvg();
    expect(svg).not.toContain("<rect");
    expect(svg).toContain("scale(0.6)");
  });

  it("o ecrã de arranque tem a marca com cantos arredondados", () => {
    expect(splashSvg()).toContain('rx="24"');
  });

  it("o favicon é igual ao ícone", () => {
    expect(faviconSvg()).toBe(iconSvg());
  });

  it("usa só as cores da marca", () => {
    const allowed = new Set([palette.green, palette.ink, palette.white].map((value) => value.toUpperCase()));
    for (const [, svg] of ALL) {
      for (const match of svg.match(/#[0-9A-Fa-f]{6}/g) ?? []) {
        expect(allowed.has(match.toUpperCase())).toBe(true);
      }
    }
  });
});
