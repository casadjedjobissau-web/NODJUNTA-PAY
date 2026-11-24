import { api } from "../lib/api";
import { useI18n } from "../lib/i18n/language";
import { LANGUAGE_NAMES, readyLanguages } from "../lib/i18n/translate";
import { OptionList } from "./OptionList";
import { SectionHeader } from "./SectionHeader";

export function LanguageSection() {
  const { language, setLanguage, t } = useI18n();
  const ready = readyLanguages();

  if (ready.length < 2) {
    return null;
  }

  const options = ready.map((value) => ({ value, label: LANGUAGE_NAMES[value] }));

  return (
    <>
      <SectionHeader title={t("language.title")} />
      <OptionList
        options={options}
        selected={language}
        onSelect={(next) => {
          void setLanguage(next);
          // O perfil no servidor também guarda o idioma. Se falhar, a escolha local continua a valer.
          api.request("/v1/profile", { method: "PATCH", body: { language: next } }).catch(() => undefined);
        }}
      />
    </>
  );
}
