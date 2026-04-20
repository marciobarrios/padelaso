export type ThemeFamily = "default" | "gameboy" | "sega" | "zelda";
export type ThemeMode = "light" | "dark";
export type ResolvedTheme = `${ThemeFamily}-${ThemeMode}`;
export type ThemePreference = ResolvedTheme | "system";

export const STORAGE_KEY = "padelaso-theme";

export interface ThemeOption {
  id: ThemePreference;
  family: ThemeFamily | "system";
  mode: ThemeMode | "auto";
  label: string;
  hint?: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  { id: "default-dark", family: "default", mode: "dark", label: "Default · Dark" },
  { id: "default-light", family: "default", mode: "light", label: "Default · Light" },
  {
    id: "system",
    family: "system",
    mode: "auto",
    label: "System",
    hint: "Tema Default según tu sistema",
  },
  { id: "gameboy-light", family: "gameboy", mode: "light", label: "Gameboy · Light" },
  { id: "gameboy-dark", family: "gameboy", mode: "dark", label: "Gameboy · Dark" },
  { id: "sega-light", family: "sega", mode: "light", label: "Sega · Light" },
  { id: "sega-dark", family: "sega", mode: "dark", label: "Sega · Dark" },
  { id: "zelda-light", family: "zelda", mode: "light", label: "Zelda · Light" },
  { id: "zelda-dark", family: "zelda", mode: "dark", label: "Zelda · Dark" },
];

export const DEFAULT_PREFERENCE: ThemePreference = "default-dark";

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === "system") {
    return systemPrefersDark ? "default-dark" : "default-light";
  }
  return preference;
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return (
    typeof value === "string" &&
    (value === "system" || THEME_OPTIONS.some((o) => o.id === value))
  );
}
