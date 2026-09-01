import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Tab {
  key: string;
  label: string;
}

interface TabsState {
  tabs: Tab[];
  add: (key: string, label: string) => void;
  remove: (key: string) => Tab[];
  closeOthers: (key: string) => void;
  rename: (key: string, label: string) => void;
}

export const useTabs = create<TabsState>()(
  persist(
    (set, get) => ({
      tabs: [],
      add: (key, label) =>
        set((s) => {
          if (s.tabs.some((t) => t.key === key)) return s;
          return { tabs: [...s.tabs, { key, label }] };
        }),
      remove: (key) => {
        set((s) => ({ tabs: s.tabs.filter((t) => t.key !== key) }));
        return get().tabs;
      },
      closeOthers: (key) => set((s) => ({ tabs: s.tabs.filter((t) => t.key === key) })),
      rename: (key, label) =>
        set((s) => ({ tabs: s.tabs.map((t) => (t.key === key ? { ...t, label } : t)) })),
    }),
    { name: "jing-tabs" },
  ),
);
