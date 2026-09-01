import { create } from "zustand";

interface AnnounceState {
  banner: string;
  dismissed: string | null;
  setBanner: (b: string) => void;
  dismiss: () => void;
}

export const useAnnounce = create<AnnounceState>((set, get) => ({
  banner: "",
  dismissed: null,
  setBanner: (banner) => set({ banner }),
  dismiss: () => set({ dismissed: get().banner }),
}));
