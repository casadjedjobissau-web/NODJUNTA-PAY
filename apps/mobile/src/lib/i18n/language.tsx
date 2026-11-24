import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { secureStorage } from "../secure-storage";
import type { MessageKey } from "./messages";
import { loadLanguage, readyLanguages, saveLanguage, translate, type Language } from "./translate";

type Params = Readonly<Record<string, string | number>>;

interface I18nValue {
  language: Language;
  setLanguage: (next: Language) => Promise<void>;
  t: (key: MessageKey, params?: Params) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("pt");

  useEffect(() => {
    let active = true;
    void loadLanguage(secureStorage).then((stored) => {
      if (active) {
        setLanguageState(stored);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const setLanguage = useCallback(async (next: Language) => {
    // Um idioma que ainda não está totalmente traduzido não pode ser escolhido.
    if (!readyLanguages().includes(next)) {
      return;
    }
    setLanguageState(next);
    await saveLanguage(secureStorage, next);
  }, []);

  const t = useCallback((key: MessageKey, params?: Params) => translate(language, key, params), [language]);

  const value = useMemo<I18nValue>(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n tem de ser usado dentro de LanguageProvider");
  }
  return context;
}
