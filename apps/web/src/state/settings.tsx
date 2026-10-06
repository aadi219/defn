import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/** User preferences (PLAN.md §M8), stored in localStorage and shared by all documents. */
export interface Settings {
  /** Match simple plural/singular variants of terms (§5.4). */
  inflection: boolean;
  /** Link document-scoped terms only after the page of their first definition. */
  onlyAfterFirstDefinition: boolean;
  /** Draw underlines under linked occurrences (`U`). Hover still works when hidden. */
  showUnderlines: boolean;
  /** CSS colour of the underlines. */
  underlineColor: string;
}

export const DEFAULT_SETTINGS: Settings = {
  inflection: true,
  onlyAfterFirstDefinition: false,
  showUnderlines: true,
  underlineColor: "#2f5bd3",
};

const KEY = "defn:settings";

/** Reads stored settings, keeping defaults for anything missing or of the wrong type. */
export function parseSettings(json: string | null): Settings {
  let stored: Record<string, unknown> = {};
  try {
    const value: unknown = JSON.parse(json ?? "{}");
    if (typeof value === "object" && value !== null) stored = value as Record<string, unknown>;
  } catch {
    // Fall back to defaults.
  }
  const bool = (key: keyof Settings) =>
    typeof stored[key] === "boolean" ? stored[key] : DEFAULT_SETTINGS[key];
  const color = stored.underlineColor;
  return {
    inflection: bool("inflection") as boolean,
    onlyAfterFirstDefinition: bool("onlyAfterFirstDefinition") as boolean,
    showUnderlines: bool("showUnderlines") as boolean,
    underlineColor:
      typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)
        ? color
        : DEFAULT_SETTINGS.underlineColor,
  };
}

interface SettingsValue {
  settings: Settings;
  update(patch: Partial<Settings>): void;
}

const SettingsContext = createContext<SettingsValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      return parseSettings(localStorage.getItem(KEY));
    } catch {
      return DEFAULT_SETTINGS;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch (err) {
      console.warn("Could not save settings", err);
    }
  }, [settings]);
  const update = useCallback(
    (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })),
    [],
  );
  const value = useMemo(() => ({ settings, update }), [settings, update]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error("useSettings must be used inside SettingsProvider");
  return value;
}
