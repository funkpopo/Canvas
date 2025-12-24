"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type Locale = "zh" | "en";

interface LanguageState {
  locale: Locale;
  messages: Record<string, any>;
  isLoading: boolean;
}

interface LanguageActions {
  setLocale: (locale: Locale) => void;
  loadMessages: () => Promise<void>;
}

export const useLanguageStore = create<LanguageState & LanguageActions>()(
  persist(
    (set, get) => ({
      locale: "zh",
      messages: {},
      isLoading: true,

      setLocale: (locale) => {
        set({ locale });
        // 切换语言时立即加载
        void get().loadMessages();
      },

      loadMessages: async () => {
        const locale = get().locale;
        set({ isLoading: true });
        try {
          const messagesModule = await import(`../../messages/${locale}.json`);
          set({ messages: messagesModule.default ?? {}, isLoading: false });
        } catch {
          set({ messages: {}, isLoading: false });
        }
      },
    }),
    {
      name: "canvas_language",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ locale: state.locale }),
    }
  )
);


