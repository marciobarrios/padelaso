"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  DEFAULT_PREFERENCE,
  isThemePreference,
  resolveTheme,
  STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from "./themes";

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// --- External store: prefers-color-scheme -----------------------------------
function subscribePrefersDark(onChange: () => void) {
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}
function getPrefersDarkSnapshot(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
const getPrefersDarkServerSnapshot = () => true;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Preference is owned by React (writable), not an external store, so we keep
  // useState for it but seed it via a lazy initializer — no effect-driven setState.
  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    if (typeof window === "undefined") return DEFAULT_PREFERENCE;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isThemePreference(stored) ? stored : DEFAULT_PREFERENCE;
  });

  const systemPrefersDark = useSyncExternalStore(
    subscribePrefersDark,
    getPrefersDarkSnapshot,
    getPrefersDarkServerSnapshot,
  );

  const resolved = resolveTheme(preference, systemPrefersDark);

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage may be unavailable (private mode, quotas). In-memory state
      // still applies the theme for this session.
    }
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}

export const THEME_INIT_SCRIPT = `(() => {
  try {
    var k = ${JSON.stringify(STORAGE_KEY)};
    var pref = localStorage.getItem(k);
    var valid = ["system","default-light","default-dark","gameboy-light","gameboy-dark","sega-light","sega-dark","zelda-light","zelda-dark"];
    if (valid.indexOf(pref) === -1) pref = ${JSON.stringify(DEFAULT_PREFERENCE)};
    var resolved = pref;
    if (pref === "system") {
      resolved = matchMedia("(prefers-color-scheme: dark)").matches ? "default-dark" : "default-light";
    }
    document.documentElement.dataset.theme = resolved;
  } catch (e) {
    document.documentElement.dataset.theme = ${JSON.stringify(DEFAULT_PREFERENCE)};
  }
})();`;
