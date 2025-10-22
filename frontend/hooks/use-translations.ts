import { useLanguage } from "@/lib/language-context"

export function useTranslations(namespace?: string) {
  const { messages } = useLanguage()

  const t = (key: string) => {
    if (namespace) {
      return messages[namespace]?.[key] || key
    }
    return messages[key] || key
  }

  return t
}
