import { useLanguage } from "@/lib/language-context"

export function useTranslations(namespace?: string) {
  const { messages } = useLanguage()

  const t = (key: string, options?: Record<string, any>) => {
    let translation = namespace ? messages[namespace]?.[key] || key : messages[key] || key

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
