"use client"

import { useEffect } from "react";
import { type Locale, useLanguageStore } from "@/lib/store/language-store";

/**
 * Zustand 版本语言管理：locale 持久化 + messages 动态加载。
 */
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const locale = useLanguageStore((s) => s.locale);
  const loadMessages = useLanguageStore((s) => s.loadMessages);

  useEffect(() => {
    void loadMessages();
  }, [locale, loadMessages]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  return children;
}

export function useLanguage(): {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  messages: Record<string, any>;
} {
  const locale = useLanguageStore((s) => s.locale);
  const setLocale = useLanguageStore((s) => s.setLocale);
  const messages = useLanguageStore((s) => s.messages);
  return { locale, setLocale, messages };
}
