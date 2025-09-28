"use client";

import { Theme as RadixTheme } from "@radix-ui/themes";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "canvas-theme";
const MEDIA_QUERY = "(prefers-color-scheme: dark)";

type ThemeName = "light" | "dark";

interface ThemeContextValue {
  theme: ThemeName;
  isDark: boolean;
  setTheme: (theme: ThemeName) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function isThemeName(value: unknown): value is ThemeName {
  return value === "light" || value === "dark";
}

function applyTheme(next: ThemeName) {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(next);
  root.style.setProperty("color-scheme", next === "dark" ? "dark" : "light");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>("dark");

  const syncTheme = useCallback((next: ThemeName) => {
    setThemeState(next);
    applyTheme(next);
  }, []);

  const setTheme = useCallback(
    (next: ThemeName) => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, next);
      }

      syncTheme(next);
    },
    [syncTheme],
  );

  const toggleTheme = useCallback(() => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
  }, [setTheme, theme]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isThemeName(stored)) {
      syncTheme(stored);
      return;
    }

    const media = window.matchMedia(MEDIA_QUERY);
    syncTheme(media.matches ? "dark" : "light");

    const listener = (event: MediaQueryListEvent) => {
      const persisted = window.localStorage.getItem(STORAGE_KEY);
      if (isThemeName(persisted)) {
        return;
      }

      syncTheme(event.matches ? "dark" : "light");
    };

    media.addEventListener("change", listener);

    return () => {
      media.removeEventListener("change", listener);
    };
  }, [syncTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      isDark: theme === "dark",
      setTheme,
      toggleTheme,
    }),
    [setTheme, theme, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      <RadixTheme
        appearance={theme}
        accentColor="teal"
        panelBackground={theme === "dark" ? "translucent" : "solid"}
      >
        {children}
      </RadixTheme>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
}
