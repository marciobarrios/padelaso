"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

type ThemePreference = "system" | "light" | "dark";

const storageKey = "padelaso-theme";
const listeners = new Set<() => void>();

const themes = [
  { value: "system", label: "Usar tema del sistema", icon: Monitor },
  { value: "light", label: "Usar tema claro", icon: Sun },
  { value: "dark", label: "Usar tema oscuro", icon: Moon },
] as const;

function getStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";

  try {
    const storedTheme = window.localStorage.getItem(storageKey);
    return storedTheme === "light" || storedTheme === "dark" ? storedTheme : "system";
  } catch {
    return "system";
  }
}

function resolveTheme(preference: ThemePreference) {
  if (preference !== "system") return preference;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(preference: ThemePreference) {
  const resolvedTheme = resolveTheme(preference);
  document.documentElement.dataset.theme = resolvedTheme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content",
    resolvedTheme === "dark" ? "#0d1712" : "#f6efde",
  );
}

function emitThemeChange() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
  const handleSystemChange = () => {
    if (getStoredPreference() === "system") applyTheme("system");
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== storageKey) return;
    applyTheme(getStoredPreference());
    emitThemeChange();
  };

  colorScheme.addEventListener("change", handleSystemChange);
  window.addEventListener("storage", handleStorage);

  return () => {
    listeners.delete(listener);
    colorScheme.removeEventListener("change", handleSystemChange);
    window.removeEventListener("storage", handleStorage);
  };
}

function selectTheme(preference: ThemePreference) {
  try {
    if (preference === "system") {
      window.localStorage.removeItem(storageKey);
    } else {
      window.localStorage.setItem(storageKey, preference);
    }
  } catch {
    // The theme still applies for this page view when storage is unavailable.
  }

  applyTheme(preference);
  emitThemeChange();
}

export function ThemeSwitcher() {
  const preference = useSyncExternalStore(subscribe, getStoredPreference, () => "system");

  return (
    <div
      className="flex h-12 items-center rounded-full border border-line bg-card p-0.5 shadow-[0_1px_0_rgb(255_255_255_/_0.08)]"
      role="group"
      aria-label="Tema de color"
    >
      {themes.map(({ value, label, icon: Icon }) => {
        const isActive = preference === value;

        return (
          <button
            className={`grid size-11 cursor-pointer place-items-center rounded-full transition-colors duration-150 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none ${
              isActive
                ? "bg-button text-button-ink shadow-sm"
                : "text-ink-soft hover:bg-line hover:text-ink"
            }`}
            type="button"
            aria-label={label}
            aria-pressed={isActive}
            title={label}
            key={value}
            onClick={() => selectTheme(value)}
          >
            <Icon aria-hidden="true" size={17} strokeWidth={2.2} />
          </button>
        );
      })}
    </div>
  );
}
