import { useLanguage } from "@/lib/language-context"

const missingKeyWarnings = new Set<string>();

export function useTranslations(namespace?: string) {
  const { messages } = useLanguage()

  const t = (key: string, options?: Record<string, any>) => {
    const raw = namespace ? messages[namespace]?.[key] : messages[key];
    let translation = raw || key;

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
