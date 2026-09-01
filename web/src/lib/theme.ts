import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "light" | "dark" | "system";

interface ThemeState {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  toggle: () => void;
}

export function systemDark() {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function resolveTheme(mode: ThemeMode): "light" | "dark" {
  return mode === "system" ? (systemDark() ? "dark" : "light") : mode;
}

export function applyMode(mode: ThemeMode) {
  document.documentElement.classList.toggle("dark", resolveTheme(mode) === "dark");
}

export const useTheme = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: "light",
      setMode: (mode) => set({ mode }),
      toggle: () => set({ mode: resolveTheme(get().mode) === "dark" ? "light" : "dark" }),
    }),
    { name: "jing-theme", partialize: (s) => ({ mode: s.mode }) },
  ),
);
