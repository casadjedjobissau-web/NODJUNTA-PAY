import type { KeyValueStore } from "../device";
import { kri, pt, type MessageKey } from "./messages";

export const LANGUAGES = ["pt", "kri"] as const;

export type Language = (typeof LANGUAGES)[number];

export const LANGUAGE_NAMES: Readonly<Record<Language, string>> = {
  pt: "Português",
  kri: "Kriol",
};

export const LANGUAGE_KEY = "nodjunta.language";

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.some((language) => language === value);
}

function dictionaryFor(language: Language): Readonly<Partial<Record<MessageKey, string>>> {
  return language === "kri" ? kri : pt;
}

// Troca {nome} pelo valor. Um marcador sem valor fica como está, para o erro se ver.
export function interpolate(template: string, params?: Readonly<Record<string, string | number>>): string {
  if (!params) {
    return template;
  }
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export function translate(
  language: Language,
  key: MessageKey,
  params?: Readonly<Record<string, string | number>>,
): string {
  const own = dictionaryFor(language)[key];
  const text = own !== undefined && own.trim().length > 0 ? own : pt[key];
  return interpolate(text, params);
}

const ALL_KEYS = Object.keys(pt) as MessageKey[];

// Fração de frases traduzidas, de 0 a 1.
export function coverage(language: Language): number {
  const dictionary = dictionaryFor(language);
  const done = ALL_KEYS.filter((key) => (dictionary[key] ?? "").trim().length > 0).length;
  return ALL_KEYS.length === 0 ? 1 : done / ALL_KEYS.length;
}

// Só os idiomas totalmente traduzidos são oferecidos ao utilizador.
export function readyLanguages(): Language[] {
  return LANGUAGES.filter((language) => coverage(language) === 1);
}

function placeholdersOf(text: string): string[] {
  return [...text.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1] ?? "").sort();
}

// Confere uma tradução contra o português: chaves que não existem, frases vazias e marcadores diferentes.
export function checkTranslation(
  base: Readonly<Record<string, string>>,
  other: Readonly<Record<string, string | undefined>>,
): string[] {
  const problems: string[] = [];
  for (const [key, value] of Object.entries(other)) {
    if (value === undefined) {
      continue;
    }
    const reference = base[key];
    if (reference === undefined) {
      problems.push(`${key}: chave desconhecida`);
      continue;
    }
    if (value.trim().length === 0) {
      problems.push(`${key}: tradução vazia`);
      continue;
    }
    if (placeholdersOf(reference).join("|") !== placeholdersOf(value).join("|")) {
      problems.push(`${key}: os marcadores {...} não coincidem`);
    }
  }
  return problems;
}

// Um idioma guardado que ainda não está totalmente traduzido volta ao português.
export async function loadLanguage(store: KeyValueStore): Promise<Language> {
  try {
    const stored = await store.getItem(LANGUAGE_KEY);
    return isLanguage(stored) && readyLanguages().includes(stored) ? stored : "pt";
  } catch {
    return "pt";
  }
}

export async function saveLanguage(store: KeyValueStore, language: Language): Promise<void> {
  try {
    await store.setItem(LANGUAGE_KEY, language);
  } catch {
    return;
  }
}
