import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

interface AppPreferencesContextValue {
  showSummaries: boolean;
  setShowSummaries: (value: boolean) => void;
}

const AppPreferencesContext = createContext<AppPreferencesContextValue | null>(null);

const STORAGE_KEY = "arknights-app-prefs-v1";

function readPrefs(): { showSummaries: boolean } {
  if (typeof window === "undefined") return { showSummaries: false };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { showSummaries: false };
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && typeof parsed.showSummaries === "boolean") {
      return { showSummaries: parsed.showSummaries };
    }
  } catch {}
  return { showSummaries: false };
}

export function AppPreferencesProvider({ children }: { children: ReactNode }) {
  const [showSummaries, setShowSummaries] = useState<boolean>(() => readPrefs().showSummaries);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ showSummaries }));
    } catch {}
  }, [showSummaries]);

  const value = useMemo<AppPreferencesContextValue>(() => ({ showSummaries, setShowSummaries }), [showSummaries]);
  return <AppPreferencesContext.Provider value={value}>{children}</AppPreferencesContext.Provider>;
}

export function useAppPreferences() {
  const ctx = useContext(AppPreferencesContext);
  if (!ctx) throw new Error("useAppPreferences must be used within AppPreferencesProvider");
  return ctx;
}

