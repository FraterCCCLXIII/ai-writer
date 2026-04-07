"use client";

import * as React from "react";

const STORAGE_KEY = "theme";
const THEMES = ["light", "dark"] as const;
type Theme = (typeof THEMES)[number];

type ThemeContextValue = {
  theme: string | undefined;
  resolvedTheme: string | undefined;
  setTheme: (value: string | ((prev: string | undefined) => string)) => void;
  themes: readonly string[];
};

const emptyContext: ThemeContextValue = {
  theme: undefined,
  resolvedTheme: undefined,
  setTheme: () => {},
  themes: THEMES,
};

const ThemeContext = React.createContext<ThemeContextValue | undefined>(
  undefined,
);

function applyTheme(root: HTMLElement, mode: Theme) {
  root.classList.remove("light", "dark");
  root.classList.add(mode);
  root.style.colorScheme = mode;
}

export function ThemeProvider({
  children,
  defaultTheme = "dark",
  storageKey = STORAGE_KEY,
}: {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}) {
  const [theme, setThemeState] = React.useState<string | undefined>(undefined);

  React.useLayoutEffect(() => {
    const root = document.documentElement;
    let stored: Theme | null = null;
    try {
      const v = localStorage.getItem(storageKey);
      if (v === "light" || v === "dark") stored = v;
    } catch {
      /* ignore */
    }
    const next = stored ?? defaultTheme;
    applyTheme(root, next);
    setThemeState(next);
  }, [defaultTheme, storageKey]);

  const setTheme = React.useCallback(
    (value: string | ((prev: string | undefined) => string)) => {
      const prev = theme ?? defaultTheme;
      const resolved = typeof value === "function" ? value(prev) : value;
      if (resolved !== "light" && resolved !== "dark") return;
      try {
        localStorage.setItem(storageKey, resolved);
      } catch {
        /* ignore */
      }
      applyTheme(document.documentElement, resolved);
      setThemeState(resolved);
    },
    [defaultTheme, storageKey, theme],
  );

  const value = React.useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme: theme,
      setTheme,
      themes: THEMES,
    }),
    [theme, setTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

/** Same shape as next-themes `useTheme` (without inline script / React 19 warning). */
export function useTheme(): ThemeContextValue {
  return React.useContext(ThemeContext) ?? emptyContext;
}
