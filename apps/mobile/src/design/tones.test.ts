import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";
import { AVATAR_TONES, TONES, avatarTone, hashSeed, toneForStatus } from "./tones";

describe("tons de etiqueta", () => {
  it.each(Object.entries(TONES))("%s cumpre o contraste mínimo de 4,5", (_name, tone) => {
    expect(contrastRatio(tone.fg, tone.bg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("tons de avatar", () => {
  it.each(AVATAR_TONES.map((tone, index) => [index, tone] as const))(
    "tom %i cumpre o contraste mínimo de 4,5",
    (_index, tone) => {
      expect(contrastRatio(tone.fg, tone.bg)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("a mesma semente dá sempre o mesmo tom", () => {
    expect(avatarTone("Maria Gomes")).toEqual(avatarTone("Maria Gomes"));
  });

  it("devolve sempre um dos tons da lista", () => {
    for (const seed of ["Maria", "João", "+245955000002", "x", "😀"]) {
      expect(AVATAR_TONES).toContainEqual(avatarTone(seed));
    }
  });

  it("semente vazia dá o primeiro tom", () => {
    expect(avatarTone("")).toEqual(AVATAR_TONES[0]);
  });

  it("hashSeed é determinístico e nunca negativo", () => {
    expect(hashSeed("Maria Gomes")).toBe(hashSeed("Maria Gomes"));
    expect(hashSeed("Maria Gomes")).toBeGreaterThanOrEqual(0);
    expect(hashSeed("")).toBe(0);
  });

  it("sementes diferentes dão hashes diferentes", () => {
    expect(hashSeed("Maria")).not.toBe(hashSeed("Mariam"));
  });
});

describe("toneForStatus", () => {
  it.each([
    ["completed", "success"],
    ["approved", "success"],
    ["active", "success"],
    ["pending", "warning"],
    ["draft", "warning"],
    ["failed", "error"],
    ["rejected", "error"],
    ["suspended", "error"],
    ["frozen", "error"],
    ["desconhecido", "neutral"],
    ["", "neutral"],
  ] as const)("%s dá %s", (status, tone) => {
    expect(toneForStatus(status)).toBe(tone);
  });
});
