import { describe, expect, it } from "vitest";
import type { KeyValueStore } from "../device";
import { kri, pt, type MessageKey } from "./messages";
import {
  LANGUAGES,
  LANGUAGE_KEY,
  checkTranslation,
  coverage,
  interpolate,
  isLanguage,
  loadLanguage,
  readyLanguages,
  saveLanguage,
  translate,
} from "./translate";

const KEYS = Object.keys(pt) as MessageKey[];

function makeStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const store: KeyValueStore = {
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
  };
  return { data, store };
}

describe("interpolate", () => {
  it("troca os marcadores conhecidos, incluindo números", () => {
    expect(interpolate("Olá {name}, tem {count} avisos.", { name: "Maria", count: 3 })).toBe("Olá Maria, tem 3 avisos.");
  });

  it("um marcador sem valor fica como está", () => {
    expect(interpolate("Olá {name}.", { other: "x" })).toBe("Olá {name}.");
  });

  it("sem parâmetros devolve o texto igual", () => {
    expect(interpolate("Olá {name}.")).toBe("Olá {name}.");
    expect(interpolate("Sem marcadores", {})).toBe("Sem marcadores");
  });

  it("troca o mesmo marcador várias vezes", () => {
    expect(interpolate("{a} e {a}", { a: "x" })).toBe("x e x");
  });
});

describe("translate", () => {
  it("em português devolve o texto de cada chave, sempre preenchido", () => {
    expect(KEYS.length).toBeGreaterThan(0);
    for (const key of KEYS) {
      expect(translate("pt", key)).toBe(pt[key]);
      expect(pt[key].trim().length).toBeGreaterThan(0);
    }
  });

  it("em crioulo usa a tradução quando existe e o português quando falta", () => {
    for (const key of KEYS) {
      const own = kri[key];
      const expected = own !== undefined && own.trim().length > 0 ? own : pt[key];
      expect(translate("kri", key)).toBe(expected);
    }
  });
});

describe("cobertura e idiomas prontos", () => {
  it("o português está sempre completo", () => {
    expect(coverage("pt")).toBe(1);
  });

  it("a cobertura fica entre 0 e 1", () => {
    for (const language of LANGUAGES) {
      expect(coverage(language)).toBeGreaterThanOrEqual(0);
      expect(coverage(language)).toBeLessThanOrEqual(1);
    }
  });

  it("só são oferecidos idiomas totalmente traduzidos, e o português está entre eles", () => {
    const ready = readyLanguages();
    expect(ready).toContain("pt");
    for (const language of ready) {
      expect(coverage(language)).toBe(1);
    }
  });

  it("isLanguage só aceita os idiomas conhecidos", () => {
    expect(isLanguage("pt")).toBe(true);
    expect(isLanguage("kri")).toBe(true);
    for (const value of ["en", "", null, undefined, 42, "PT"]) {
      expect(isLanguage(value)).toBe(false);
    }
  });
});

describe("checkTranslation", () => {
  const base = { a: "Olá {name}", b: "Sem marcadores", c: "{x} e {y}" };

  it("uma tradução certa não tem problemas, e a ordem dos marcadores é livre", () => {
    expect(checkTranslation(base, { a: "Bon dia {name}", c: "{y} i {x}" })).toEqual([]);
  });

  it("deteta uma chave que não existe", () => {
    expect(checkTranslation(base, { z: "x" })).toEqual(["z: chave desconhecida"]);
  });

  it("deteta uma frase vazia", () => {
    expect(checkTranslation(base, { b: "   " })).toEqual(["b: tradução vazia"]);
  });

  it("deteta marcadores a menos, a mais ou diferentes", () => {
    expect(checkTranslation(base, { a: "Bon dia" })).toEqual(["a: os marcadores {...} não coincidem"]);
    expect(checkTranslation(base, { b: "Com {extra}" })).toEqual(["b: os marcadores {...} não coincidem"]);
    expect(checkTranslation(base, { a: "Bon dia {nome}" })).toEqual(["a: os marcadores {...} não coincidem"]);
  });

  it("ignora entradas indefinidas", () => {
    expect(checkTranslation(base, { a: undefined })).toEqual([]);
  });

  it("o dicionário de crioulo é sempre válido contra o português", () => {
    expect(checkTranslation(pt, kri)).toEqual([]);
  });
});

describe("loadLanguage e saveLanguage", () => {
  it("sem nada guardado usa o português", async () => {
    expect(await loadLanguage(makeStore().store)).toBe("pt");
  });

  it("um valor desconhecido volta ao português", async () => {
    expect(await loadLanguage(makeStore({ [LANGUAGE_KEY]: "en" }).store)).toBe("pt");
  });

  it("o crioulo só é carregado quando está totalmente traduzido", async () => {
    const expected = readyLanguages().includes("kri") ? "kri" : "pt";
    expect(await loadLanguage(makeStore({ [LANGUAGE_KEY]: "kri" }).store)).toBe(expected);
  });

  it("se a leitura falhar, usa o português", async () => {
    const store: KeyValueStore = {
      getItem: async () => {
        throw new Error("armazenamento indisponível");
      },
      setItem: async () => undefined,
    };
    expect(await loadLanguage(store)).toBe("pt");
  });

  it("grava o idioma na chave certa, e uma falha a gravar não lança erro", async () => {
    const { store, data } = makeStore();
    await saveLanguage(store, "pt");
    expect(data.get(LANGUAGE_KEY)).toBe("pt");
    expect(LANGUAGE_KEY).toBe("nodjunta.language");

    const broken: KeyValueStore = {
      getItem: async () => null,
      setItem: async () => {
        throw new Error("armazenamento indisponível");
      },
    };
    await expect(saveLanguage(broken, "pt")).resolves.toBeUndefined();
  });
});
