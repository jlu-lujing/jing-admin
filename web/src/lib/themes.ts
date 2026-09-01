import { create } from "zustand";
import { persist } from "zustand/middleware";
import { resolveTheme, useTheme } from "./theme";

export interface Accent {
  ember: string;
  deep: string;
  soft: string;
  glow: string;
}

export interface Core {
  canvas: string;
  canvasDeep: string;
  surface: string;
  surface2: string;
  ink: string;
  inkSoft: string;
  inkMute: string;
  inkFaint: string;
  line: string;
  lineSoft: string;
  lineStrong: string;
}

export interface Chrome {
  sidebarBg: string;
  sidebarLine: string;
  navText: string;
  navMuted: string;
  navHover: string;
  navActiveBg: string;
  navActiveText: string;
  navActiveShadow: string;
  navActiveIcon: string;
  brand: string;
  brandAccent: string;
  stripe: string;
}

export interface ThemeDef {
  id: string;
  name: string;
  tagline: string;
  radius: string;
  btnRadius: string;
  spacing: string;
  shadow: "flat" | "soft" | "float";
  displayFont?: string;
  amb1: string;
  amb2: string;
  accent: { light: Accent; dark: Accent };
  core: { light: Core; dark: Core };
  chrome?: { light: Chrome; dark: Chrome };
}

export const GROTESK = '"Schibsted Grotesk", ui-sans-serif, system-ui, sans-serif';
const MONO = '"IBM Plex Mono", ui-monospace, "SFMono-Regular", monospace';
const SERIF = '"Source Serif 4", ui-serif, Georgia, "Songti SC", serif';

export function baseChrome(c: Core, _mode?: "light" | "dark"): Chrome {
  return {
    sidebarBg: c.surface,
    sidebarLine: c.line,
    navText: c.inkMute,
    navMuted: c.inkFaint,
    navHover: c.canvasDeep,
    navActiveBg: "var(--c-ember-soft)",
    navActiveText: c.ink,
    navActiveShadow: "none",
    navActiveIcon: "var(--c-ember)",
    brand: c.ink,
    brandAccent: "var(--c-ember)",
    stripe: "transparent",
  };
}



export const THEMES: ThemeDef[] = [
  {
    id: "azure",
    name: "青墨",
    tagline: "编辑质感 · 沉静",
    radius: "10px",
    btnRadius: "8px",
    spacing: "0.25rem",
    shadow: "soft",
    displayFont: SERIF,
    amb1: "transparent",
    amb2: "transparent",
    accent: {
      light: { ember: "#2b52d9", deep: "#1e3da6", soft: "#e9edfb", glow: "#7d97ee" },
      dark: { ember: "#7d97ee", deep: "#a9bcf7", soft: "rgba(125,151,238,0.15)", glow: "#a5b8f5" },
    },
    core: {
      light: { canvas: "#f4f5f7", canvasDeep: "#ebedf1", surface: "#ffffff", surface2: "#f8f9fb", ink: "#15181e", inkSoft: "#3b4150", inkMute: "#646d80", inkFaint: "#99a1b3", line: "#e3e6ec", lineSoft: "#eceef2", lineStrong: "#ccd2dd" },
      dark: { canvas: "#0e1014", canvasDeep: "#171a20", surface: "#14171d", surface2: "#191d24", ink: "#e7eaef", inkSoft: "#a9b1bf", inkMute: "#7e8798", inkFaint: "#576072", line: "#242932", lineSoft: "#1d222b", lineStrong: "#3a4150" },
    },
  },
  {
    id: "graphite",
    name: "石墨",
    tagline: "极简高对比",
    radius: "7px",
    btnRadius: "5px",
    spacing: "0.23rem",
    shadow: "flat",
    displayFont: GROTESK,
    amb1: "transparent",
    amb2: "transparent",
    chrome: {
      light: {
        ...baseChrome({"canvas":"#f8f8f8","canvasDeep":"#efefef","surface":"#ffffff","surface2":"#fbfbfb","ink":"#09090b","inkSoft":"#3f3f46","inkMute":"#71717a","inkFaint":"#a1a1aa","line":"#e5e5e5","lineSoft":"#f0f0f0","lineStrong":"#d4d4d4"}, "light"),
        navActiveBg: "#18181b",
        navActiveText: "#ffffff",
      },
      dark: {
        ...baseChrome({"canvas":"#0a0a0b","canvasDeep":"#171719","surface":"#101012","surface2":"#141416","ink":"#f4f4f5","inkSoft":"#c0c0c6","inkMute":"#8b8b93","inkFaint":"#62626b","line":"#26262a","lineSoft":"#1c1c20","lineStrong":"#3a3a40"}, "dark"),
        navActiveBg: "#fafafa",
        navActiveText: "#09090b",
      },
    },
    accent: {
      light: { ember: "#18181b", deep: "#000000", soft: "#e4e4e7", glow: "#52525b" },
      dark: { ember: "#e4e4e7", deep: "#fafafa", soft: "rgba(228,228,231,0.14)", glow: "#a1a1aa" },
    },
    core: {
      light: { canvas: "#f8f8f8", canvasDeep: "#efefef", surface: "#ffffff", surface2: "#fbfbfb", ink: "#09090b", inkSoft: "#3f3f46", inkMute: "#71717a", inkFaint: "#a1a1aa", line: "#e5e5e5", lineSoft: "#f0f0f0", lineStrong: "#d4d4d4" },
      dark: { canvas: "#0a0a0b", canvasDeep: "#171719", surface: "#101012", surface2: "#141416", ink: "#f4f4f5", inkSoft: "#c0c0c6", inkMute: "#8b8b93", inkFaint: "#62626b", line: "#26262a", lineSoft: "#1c1c20", lineStrong: "#3a3a40" },
    },
  },
  {
    id: "ocean",
    name: "海洋",
    tagline: "稳重商务",
    radius: "9px",
    btnRadius: "7px",
    spacing: "0.25rem",
    shadow: "soft",
    displayFont: SERIF,
    amb1: "rgba(26,86,168,0.05)",
    amb2: "rgba(123,164,217,0.05)",
    chrome: {
      light: {
        ...baseChrome({"canvas":"#f2f4f8","canvasDeep":"#e4e9f1","surface":"#ffffff","surface2":"#f7f9fc","ink":"#182a45","inkSoft":"#3c4f6b","inkMute":"#6b7d97","inkFaint":"#a4b2c6","line":"#dde4ee","lineSoft":"#e9eef5","lineStrong":"#c9d3e1"}, "light"),
        sidebarBg: "#122a4d",
        sidebarLine: "#1e3a62",
        navText: "#9db6d4",
        navMuted: "#5f7ea6",
        navHover: "rgba(255,255,255,0.05)",
        navActiveBg: "rgba(255,255,255,0.10)",
        navActiveText: "#ffffff",
        brand: "#f2f6fb",
        brandAccent: "#7ba4d9",
        stripe: "rgba(18,42,77,0.035)",
      },
      dark: {
        ...baseChrome({"canvas":"#0a1220","canvasDeep":"#12203a","surface":"#0e1a2c","surface2":"#122138","ink":"#e3ebf5","inkSoft":"#b2c2d6","inkMute":"#7e93ac","inkFaint":"#576d87","line":"#1a2c47","lineSoft":"#13233c","lineStrong":"#27405f"}, "dark"),
        sidebarBg: "#081527",
        navActiveBg: "rgba(255,255,255,0.08)",
        navActiveText: "#eaf1f9",
        navHover: "rgba(255,255,255,0.04)",
        brand: "#eaf1f9",
        stripe: "rgba(158,196,235,0.035)",
      },
    },
    accent: {
      light: { ember: "#1a56a8", deep: "#13417f", soft: "#e9f0f9", glow: "#7ba4d9" },
      dark: { ember: "#6ea8e8", deep: "#a8c9f0", soft: "rgba(110,168,232,0.14)", glow: "#9cc0ee" },
    },
    core: {
      light: { canvas: "#f2f4f8", canvasDeep: "#e4e9f1", surface: "#ffffff", surface2: "#f7f9fc", ink: "#182a45", inkSoft: "#3c4f6b", inkMute: "#6b7d97", inkFaint: "#a4b2c6", line: "#dde4ee", lineSoft: "#e9eef5", lineStrong: "#c9d3e1" },
      dark: { canvas: "#0a1220", canvasDeep: "#12203a", surface: "#0e1a2c", surface2: "#122138", ink: "#e3ebf5", inkSoft: "#b2c2d6", inkMute: "#7e93ac", inkFaint: "#576d87", line: "#1a2c47", lineSoft: "#13233c", lineStrong: "#27405f" },
    },
  },
  {
    id: "emerald",
    name: "翡翠",
    tagline: "自然呼吸感",
    radius: "15px",
    btnRadius: "999px",
    spacing: "0.26rem",
    shadow: "soft",
    displayFont: GROTESK,
    amb1: "rgba(5,150,105,0.05)",
    amb2: "rgba(52,211,153,0.05)",
    chrome: {
      light: {
        ...baseChrome({"canvas":"#f4f7f4","canvasDeep":"#e8eee8","surface":"#ffffff","surface2":"#f8fbf8","ink":"#0d1712","inkSoft":"#31463c","inkMute":"#5d7468","inkFaint":"#93a89c","line":"#e0e8e2","lineSoft":"#ecf1ed","lineStrong":"#cbd8ce"}, "light"),
        sidebarBg: "#eef5ef",
        sidebarLine: "#dde9de",
        navActiveText: "#065f46",
      },
      dark: {
        ...baseChrome({"canvas":"#0a110e","canvasDeep":"#141e18","surface":"#0f1613","surface2":"#131b17","ink":"#e4efe9","inkSoft":"#b1c5ba","inkMute":"#7d9488","inkFaint":"#586e63","line":"#1e2a23","lineSoft":"#18211c","lineStrong":"#31413a"}, "dark"),
        sidebarBg: "#0d1511",
      },
    },
    accent: {
      light: { ember: "#059669", deep: "#047857", soft: "#d6f5e7", glow: "#34d399" },
      dark: { ember: "#34d399", deep: "#6ee7b7", soft: "rgba(52,211,153,0.13)", glow: "#a7f3d0" },
    },
    core: {
      light: { canvas: "#f4f7f4", canvasDeep: "#e8eee8", surface: "#ffffff", surface2: "#f8fbf8", ink: "#0d1712", inkSoft: "#31463c", inkMute: "#5d7468", inkFaint: "#93a89c", line: "#e0e8e2", lineSoft: "#ecf1ed", lineStrong: "#cbd8ce" },
      dark: { canvas: "#0a110e", canvasDeep: "#141e18", surface: "#0f1613", surface2: "#131b17", ink: "#e4efe9", inkSoft: "#b1c5ba", inkMute: "#7d9488", inkFaint: "#586e63", line: "#1e2a23", lineSoft: "#182119", lineStrong: "#31413a" },
    },
  },
  {
    id: "sunset",
    name: "日落",
    tagline: "暖调活力",
    radius: "16px",
    btnRadius: "999px",
    spacing: "0.27rem",
    shadow: "float",
    displayFont: GROTESK,
    amb1: "rgba(217,119,6,0.06)",
    amb2: "rgba(251,191,36,0.06)",
    chrome: {
      light: {
        ...baseChrome({"canvas":"#faf7f2","canvasDeep":"#f2ece1","surface":"#ffffff","surface2":"#fdfbf7","ink":"#1c1408","inkSoft":"#4d3f2c","inkMute":"#7d6c54","inkFaint":"#b09d82","line":"#ece4d6","lineSoft":"#f4eee3","lineStrong":"#ddd0bc"}, "light"),
        sidebarBg: "#fdf6ea",
        sidebarLine: "#f1e5d0",
        navText: "#8a745c",
        navHover: "#f6ead8",
        navActiveBg: "var(--c-ember)",
        navActiveText: "#ffffff",
        navActiveShadow: "0 6px 14px -6px rgba(217,119,6,0.55)",
        navActiveIcon: "#ffffff",
        brand: "#3c2a10",
        stripe: "rgba(217,119,6,0.03)",
      },
      dark: {
        ...baseChrome({"canvas":"#120e08","canvasDeep":"#1f1810","surface":"#181209","surface2":"#1d150c","ink":"#f2ead9","inkSoft":"#cbbda3","inkMute":"#9a8b71","inkFaint":"#6b5e49","line":"#2b2214","lineSoft":"#221a0f","lineStrong":"#413424"}, "dark"),
        sidebarBg: "#171007",
        navActiveBg: "var(--c-ember)",
        navActiveText: "#1c1408",
        navActiveIcon: "#1c1408",
        stripe: "rgba(251,191,36,0.03)",
      },
    },
    accent: {
      light: { ember: "#d97706", deep: "#b45309", soft: "#fdeecd", glow: "#fbbf24" },
      dark: { ember: "#fbbf24", deep: "#fcd34d", soft: "rgba(251,191,36,0.13)", glow: "#fde68a" },
    },
    core: {
      light: { canvas: "#faf7f2", canvasDeep: "#f2ece1", surface: "#ffffff", surface2: "#fdfbf7", ink: "#1c1408", inkSoft: "#4d3f2c", inkMute: "#7d6c54", inkFaint: "#b09d82", line: "#ece4d6", lineSoft: "#f4eee3", lineStrong: "#ddd0bc" },
      dark: { canvas: "#120e08", canvasDeep: "#1f1810", surface: "#181209", surface2: "#1d150c", ink: "#f2ead9", inkSoft: "#cbbda3", inkMute: "#9a8b71", inkFaint: "#6b5e49", line: "#2b2214", lineSoft: "#221a0f", lineStrong: "#413424" },
    },
  },
  {
    id: "midnight",
    name: "午夜",
    tagline: "极暗专注",
    radius: "11px",
    btnRadius: "7px",
    spacing: "0.25rem",
    shadow: "float",
    displayFont: MONO,
    amb1: "rgba(124,58,237,0.06)",
    amb2: "rgba(167,139,250,0.06)",
    chrome: {
      light: {
        ...baseChrome({"canvas":"#f3f3fb","canvasDeep":"#e9e9f5","surface":"#ffffff","surface2":"#f9f9fd","ink":"#131329","inkSoft":"#3d3d5c","inkMute":"#6c6c8a","inkFaint":"#9d9db8","line":"#e4e4f0","lineSoft":"#ededf6","lineStrong":"#d0d0e2"}, "light"),
        sidebarBg: "#14142c",
        sidebarLine: "#242445",
        navText: "#a6a6cc",
        navMuted: "#6b6b96",
        navHover: "rgba(167,139,250,0.08)",
        navActiveBg: "rgba(167,139,250,0.16)",
        navActiveText: "#e4dcfe",
        navActiveShadow: "0 0 16px rgba(167,139,250,0.35)",
        brand: "#eceafc",
        brandAccent: "#a78bfa",
      },
      dark: {
        ...baseChrome({"canvas":"#0c0c16","canvasDeep":"#171726","surface":"#12121f","surface2":"#161625","ink":"#e9e9f6","inkSoft":"#bcbccc","inkMute":"#8b8b9e","inkFaint":"#63637a","line":"#232338","lineSoft":"#1b1b2c","lineStrong":"#35354e"}, "dark"),
        sidebarBg: "#101024",
        navActiveBg: "rgba(167,139,250,0.16)",
        navActiveText: "#ddd2fe",
        navActiveShadow: "0 0 16px rgba(167,139,250,0.3)",
        brand: "#eceafc",
      },
    },
    accent: {
      light: { ember: "#7c3aed", deep: "#6d28d9", soft: "#f1eafe", glow: "#a78bfa" },
      dark: { ember: "#a78bfa", deep: "#c4b5fd", soft: "rgba(167,139,250,0.14)", glow: "#ddd6fe" },
    },
    core: {
      light: { canvas: "#f3f3fb", canvasDeep: "#e9e9f5", surface: "#ffffff", surface2: "#f9f9fd", ink: "#131329", inkSoft: "#3d3d5c", inkMute: "#6c6c8a", inkFaint: "#9d9db8", line: "#e4e4f0", lineSoft: "#ededf6", lineStrong: "#d0d0e2" },
      dark: { canvas: "#0c0c16", canvasDeep: "#171726", surface: "#12121f", surface2: "#161625", ink: "#e9e9f6", inkSoft: "#bcbccc", inkMute: "#8b8b9e", inkFaint: "#63637a", line: "#232338", lineSoft: "#1b1b2c", lineStrong: "#35354e" },
    },
  },
];

interface ThemeStore {
  themeId: string;
  setTheme: (id: string) => void;
  cycle: () => void;
}

export const useAppTheme = create<ThemeStore>()(
  persist(
    (set, get) => ({
      themeId: "azure",
      setTheme: (themeId) => set({ themeId }),
      cycle: () => {
        const i = THEMES.findIndex((t) => t.id === get().themeId);
        set({ themeId: THEMES[(i + 1) % THEMES.length].id });
      },
    }),
    { name: "jing-apptheme", partialize: (s) => ({ themeId: s.themeId }) },
  ),
);

const SHADOWS = {
  flat: { soft: "none", pop: "0 1px 3px rgba(0,0,0,.08)" },
  soft: { soft: "0 1px 2px rgba(16,24,40,.05), 0 2px 4px -2px rgba(16,24,40,.05)", pop: "0 12px 32px -12px rgba(16,24,40,.16), 0 2px 6px -2px rgba(16,24,40,.06)" },
  float: { soft: "0 2px 4px rgba(16,24,40,.06), 0 6px 16px -6px rgba(16,24,40,.10)", pop: "0 18px 44px -12px rgba(16,24,40,.22), 0 4px 10px -4px rgba(16,24,40,.10)" },
};

/** 应用整套主题：色彩系统 + 圆角 + 间距密度 + 标题字体 + 阴影层级 */
export function applyAppTheme() {
  const def = THEMES.find((t) => t.id === useAppTheme.getState().themeId) ?? THEMES[0];
  const mode = resolveTheme(useTheme.getState().mode);
  const a = def.accent[mode];
  const c = def.core[mode];
  const root = document.documentElement;

  const set = (k: string, v: string) => root.style.setProperty(k, v);
  set("--c-ember", a.ember);
  set("--c-ember-deep", a.deep);
  set("--c-ember-soft", a.soft);
  set("--c-ember-glow", a.glow);
  set("--c-canvas", c.canvas);
  set("--c-canvas-deep", c.canvasDeep);
  set("--c-surface", c.surface);
  set("--c-surface-2", c.surface2);
  set("--c-ink", c.ink);
  set("--c-ink-soft", c.inkSoft);
  set("--c-ink-mute", c.inkMute);
  set("--c-ink-faint", c.inkFaint);
  set("--c-line", c.line);
  set("--c-line-soft", c.lineSoft);
  set("--c-line-strong", c.lineStrong);
  set("--radius-card", def.radius);
  set("--spacing", def.spacing);
  set("--font-display", def.displayFont ?? GROTESK);
  set("--c-shadow-soft", SHADOWS[def.shadow].soft);
  set("--c-shadow-pop", SHADOWS[def.shadow].pop);
  set("--c-shadow-ember", `0 6px 16px -8px color-mix(in srgb, ${a.ember} 60%, transparent)`);
  set("--radius-btn", def.btnRadius);
  set("--c-amb1", def.amb1);
  set("--c-amb2", def.amb2);

  // 主题性格：侧栏形态 / 导航激活 / 斑马纹 / 行色系统
  const chrome: Chrome = { ...baseChrome(c, mode), ...(def.chrome?.[mode] ?? {}) };
  set("--c-sidebar", chrome.sidebarBg);
  set("--c-sidebar-line", chrome.sidebarLine);
  set("--c-nav-text", chrome.navText);
  set("--c-nav-muted", chrome.navMuted);
  set("--c-nav-hover", chrome.navHover);
  set("--c-nav-active-bg", chrome.navActiveBg);
  set("--c-nav-active-text", chrome.navActiveText);
  set("--c-nav-active-shadow", chrome.navActiveShadow);
  set("--c-nav-active-icon", chrome.navActiveIcon);
  set("--c-brand", chrome.brand);
  set("--c-brand-accent", chrome.brandAccent);
  set("--c-stripe", chrome.stripe);
  set("--c-row", c.surface);
  set("--c-row-hover", mode === "dark" ? c.canvasDeep : c.surface2);
  root.dataset.theme = mode;
  root.dataset.preset = def.id;
}
