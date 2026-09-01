import zhCNCommon from "../locales/zh-CN/common.json";
import zhCNDashboard from "../locales/zh-CN/dashboard.json";
import enCommon from "../locales/en/common.json";
import enDashboard from "../locales/en/dashboard.json";

export const supportedLanguages = {
  "zh-CN": "简体中文",
  en: "English",
} as const;

export type SupportedLanguage = keyof typeof supportedLanguages;

export const resources = {
  "zh-CN": {
    common: zhCNCommon,
    dashboard: zhCNDashboard,
  },
  en: {
    common: enCommon,
    dashboard: enDashboard,
  },
} as const;
