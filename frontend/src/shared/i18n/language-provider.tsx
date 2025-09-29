"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type LanguageCode = "en" | "zh";

interface LanguageContextValue {
  language: LanguageCode;
  setLanguage: (code: LanguageCode) => void;
}

const STORAGE_KEY = "canvas-language";

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function isLanguageCode(v: unknown): v is LanguageCode {
  return v === "en" || v === "zh";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLang] = useState<LanguageCode>("en");

  const apply = useCallback((code: LanguageCode) => {
    setLang(code);
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("lang", code);
    }
  }, []);

  const setLanguage = useCallback(
    (code: LanguageCode) => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, code);
      }
      apply(code);
    },
    [apply],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLanguageCode(stored)) {
      apply(stored);
      return;
    }
    // Default to browser language
    const nav = window.navigator.language.toLowerCase();
    apply(nav.startsWith("zh") ? "zh" : "en");
  }, [apply]);

  const value = useMemo<LanguageContextValue>(() => ({ language, setLanguage }), [language, setLanguage]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}

