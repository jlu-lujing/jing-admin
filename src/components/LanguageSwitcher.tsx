import { useTranslation } from "react-i18next";
import { supportedLanguages, type SupportedLanguage } from "../i18n/resources";

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation("common");

  return (
    <label>
      {t("language")}
      <select
        aria-label={t("languageSwitcher")}
        value={i18n.resolvedLanguage ?? i18n.language}
        onChange={(event) =>
          i18n.changeLanguage(event.target.value as SupportedLanguage)
        }
      >
        {Object.entries(supportedLanguages).map(([code, label]) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
