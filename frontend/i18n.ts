import { getRequestConfig } from 'next-intl/server'

export default getRequestConfig(async () => {
  // Default to Chinese for server-side rendering
  const locale = 'zh'

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default
  }
})
