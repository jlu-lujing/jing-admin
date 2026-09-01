import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { resources } from "./resources";

export const DEFAULT_LANGUAGE = "zh-CN";
export const NAMESPACES = ["common", "dashboard"] as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: Object.keys(resources),
    defaultNS: "common",
    ns: [...NAMESPACES],
    interpolation: { escapeValue: false },
    detection: {
      // Conservative default: always boot in zh-CN unless the user has
      // explicitly switched before (persisted choice). Browser-language
      // sniffing is intentionally not used so the default stays deterministic.
      order: ["localStorage"],
      lookupLocalStorage: "jing-admin-language",
      caches: ["localStorage"],
    },
  });

export default i18n;
