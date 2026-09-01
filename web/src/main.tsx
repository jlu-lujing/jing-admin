import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setBusy } from "./lib/progress";
import App from "./App";
import { Toaster } from "./components/ui/Toast";
import { I18nProvider } from "./lib/i18n";
import { applyMode, useTheme } from "./lib/theme";
import { applyAppTheme, useAppTheme } from "./lib/themes";
import "./index.css";

applyMode(useTheme.getState().mode);
applyAppTheme();
useTheme.subscribe((s) => {
  applyMode(s.mode);
  applyAppTheme();
});
useAppTheme.subscribe(() => applyAppTheme());
window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
  const s = useTheme.getState();
  if (s.mode === "system") {
    applyMode("system");
    applyAppTheme();
  }
});

const queryCache = new QueryCache();
queryCache.subscribe(() => {
  let any = false;
  for (const q of queryCache.getAll()) {
    if (q.state.fetchStatus === "fetching") {
      any = true;
      break;
    }
  }
  setBusy(any);
});

const queryClient = new QueryClient({
  queryCache,
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 15_000,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <App />
        </BrowserRouter>
      </I18nProvider>
    </QueryClientProvider>
    <Toaster />
  </StrictMode>,
);
