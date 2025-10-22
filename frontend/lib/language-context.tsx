"use client"

import React, { createContext, useContext, useEffect, useState } from 'react'

type Locale = 'zh' | 'en'

interface LanguageContextType {
  locale: Locale
  setLocale: (locale: Locale) => void
  messages: Record<string, any>
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('zh')
  const [messages, setMessages] = useState<Record<string, any>>({})

  // Load messages for the current locale
  useEffect(() => {
    const loadMessages = async () => {
      try {
        const messagesModule = await import(`../messages/${locale}.json`)
        setMessages(messagesModule.default)
      } catch (error) {
        console.error(`Failed to load messages for locale ${locale}:`, error)
      }
    }

    loadMessages()
  }, [locale])

  // Load saved locale from localStorage on mount
  useEffect(() => {
    const savedLocale = localStorage.getItem('locale') as Locale
    if (savedLocale && (savedLocale === 'zh' || savedLocale === 'en')) {
      setLocaleState(savedLocale)
    }
  }, [])

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale)
    localStorage.setItem('locale', newLocale)
  }

  return (
    <LanguageContext.Provider value={{ locale, setLocale, messages }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return context
}
