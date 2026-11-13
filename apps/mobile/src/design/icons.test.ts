import { describe, expect, it } from "vitest";
import { FILLED_ICONS, ICONS, ICON_GRID, ICON_NAMES } from "./icons";

const REQUIRED = [
  "home",
  "send",
  "receive",
  "qr",
  "wallet",
  "history",
  "bell",
  "user",
  "shield",
  "support",
  "plus",
  "minus",
  "check",
  "close",
  "chevronRight",
  "chevronLeft",
  "eye",
  "eyeOff",
  "lock",
  "phone",
  "share",
  "receipt",
  "store",
  "settings",
  "camera",
  "warning",
  "info",
  "star",
];

describe("ícones", () => {
  it("existem todos os ícones necessários às telas", () => {
    for (const name of REQUIRED) {
      expect(ICON_NAMES).toContain(name);
    }
  });

  it("não há nomes repetidos", () => {
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
  });

  it.each(ICON_NAMES.map((name) => [name, ICONS[name]] as const))(
    "%s usa só comandos de caminho permitidos e começa por M",
    (_name, path) => {
      expect(path.startsWith("M")).toBe(true);
      expect(path).toMatch(/^[MLHVCZ0-9.\s]+$/);
    },
  );

  it.each(ICON_NAMES.map((name) => [name, ICONS[name]] as const))(
    "%s tem todas as coordenadas dentro da grelha 24 por 24",
    (_name, path) => {
      const numbers = (path.match(/\d+(\.\d+)?/g) ?? []).map(Number);
      expect(numbers.length).toBeGreaterThan(0);
      for (const value of numbers) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(ICON_GRID);
      }
    },
  );

  it("os ícones preenchidos existem na lista", () => {
    for (const name of FILLED_ICONS) {
      expect(ICON_NAMES).toContain(name);
    }
  });

  it("a estrela tem 10 vértices: um M e nove L", () => {
    const star = ICONS.star;
    expect(star.match(/M/g)).toHaveLength(1);
    expect(star.match(/L/g)).toHaveLength(9);
    expect(star.endsWith("Z")).toBe(true);
  });

  it("os círculos fecham-se (cada círculo termina em Z)", () => {
    expect(ICONS.history.match(/Z/g)).toHaveLength(1);
    expect(ICONS.settings.match(/Z/g)).toHaveLength(2);
    expect(ICONS.camera.match(/Z/g)).toHaveLength(2);
  });
});
