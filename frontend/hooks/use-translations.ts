import { useLanguage } from "@/lib/language-context"
import { LOCALE_MESSAGES } from "@/lib/store/language-store";

const missingKeyWarnings = new Set<string>();

function resolveMessage(messages: Record<string, any>, namespace: string | undefined, key: string) {
  const source = namespace ? messages[namespace] : messages;
  const value = source?.[key];
  return typeof value === "string" ? value : undefined;
}

export function useTranslations(namespace?: string) {
  const { locale, messages } = useLanguage()

  const t = (key: string, options?: Record<string, any>) => {
    const fallbackLocale = locale === "zh" ? "en" : "zh";
    const raw =
      resolveMessage(messages, namespace, key) ??
      resolveMessage(LOCALE_MESSAGES[locale], namespace, key) ??
      resolveMessage(LOCALE_MESSAGES[fallbackLocale], namespace, key);
    let translation = raw ?? key;

    if (!raw && process.env.NODE_ENV !== "production") {
      const warningKey = namespace ? `${namespace}.${key}` : key;
      if (!missingKeyWarnings.has(warningKey)) {
        missingKeyWarnings.add(warningKey);
        console.warn(`[i18n] Missing translation key: ${warningKey}`);
      }
    }

    // 简单的插值替换
    if (options) {
      Object.entries(options).forEach(([placeholder, value]) => {
        translation = translation.replace(new RegExp(`\\{${placeholder}\\}`, 'g'), String(value))
      })
    }

    return translation
  }

  return t
}
