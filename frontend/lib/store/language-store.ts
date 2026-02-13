"use client";

import enMessages from "@/messages/en.json";
import zhMessages from "@/messages/zh.json";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type Locale = "zh" | "en";
const STORAGE_KEY = "canvas_language";

export const LOCALE_MESSAGES: Record<Locale, Record<string, any>> = {
  zh: zhMessages as Record<string, any>,
  en: enMessages as Record<string, any>,
};

function isLocale(value: unknown): value is Locale {
  return value === "zh" || value === "en";
}

function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") {
    return "zh";
  }

  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function getInitialLocale(): Locale {
  if (typeof window === "undefined") {
    return "zh";
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return detectBrowserLocale();
    }

    const parsed = JSON.parse(raw);
    const persistedLocale = parsed?.state?.locale;
    if (isLocale(persistedLocale)) {
      return persistedLocale;
    }
  } catch {
    // Ignore invalid localStorage payload and fall back to browser language.
  }

  return detectBrowserLocale();
}

interface LanguageState {
  locale: Locale;
  messages: Record<string, any>;
  isLoading: boolean;
}

interface LanguageActions {
  setLocale: (locale: Locale) => void;
  loadMessages: () => Promise<void>;
}

const initialLocale = getInitialLocale();

export const useLanguageStore = create<LanguageState & LanguageActions>()(
  persist(
    (set, get) => ({
      locale: initialLocale,
      messages: LOCALE_MESSAGES[initialLocale],
      isLoading: false,

      setLocale: (locale) => {
        set({
          locale,
          messages: LOCALE_MESSAGES[locale],
          isLoading: false,
        });
      },

      loadMessages: async () => {
        const locale = get().locale;
        set({ messages: LOCALE_MESSAGES[locale], isLoading: false });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ locale: state.locale }),
    }
  )
);


