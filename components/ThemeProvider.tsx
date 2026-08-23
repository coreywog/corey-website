"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { THEMES, THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Site-wide theme (light/dark/creamsicle), persisted to localStorage and
 * applied as data-theme on <html> — see app/globals.css's @custom-variant
 * rules, which make Tailwind's dark:/creamsicle: variants key off that
 * attribute. The inline script in app/layout.tsx's <head> sets the
 * attribute before hydration so there's no flash of the wrong theme;
 * this provider just keeps React state and the DOM attribute in sync
 * after that.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored && (THEMES as readonly string[]).includes(stored)) {
      setThemeState(stored as Theme);
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  function setTheme(next: Theme) {
    setThemeState(next);
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
