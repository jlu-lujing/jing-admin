import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CurrentUser } from "./types";

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: CurrentUser | null;
  setSession: (t: { accessToken: string; refreshToken: string; user: CurrentUser }) => void;
  setUser: (u: CurrentUser) => void;
  clear: () => void;
  has: (perm: string) => boolean;
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setSession: ({ accessToken, refreshToken, user }) =>
        set({ accessToken, refreshToken, user }),
      setUser: (user) => set({ user }),
      clear: () => set({ accessToken: null, refreshToken: null, user: null }),
      has: (perm) => !!get().user?.permissions?.includes(perm),
    }),
    {
      name: "jing-auth",
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        user: s.user,
      }),
    },
  ),
);
