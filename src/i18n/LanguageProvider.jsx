import { useCallback, useEffect, useMemo } from 'react'
import { useAuth } from '../auth/useAuth.js'
import { saveOwnLanguage } from '../lib/userProfiles.js'
import { LanguageContext } from './languageContext.js'
import { defaultLanguage, normalizeLanguage, translate } from './translations.js'

export function LanguageProvider({ children }) {
  const { user, profile } = useAuth()
  const language = user ? normalizeLanguage(profile?.language) : defaultLanguage

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const setLanguage = useCallback(async (nextLanguage) => {
    const normalized = normalizeLanguage(nextLanguage)
    if (!user || normalized === language) return
    await saveOwnLanguage(normalized)
  }, [language, user])

  const t = useCallback((key, values) => translate(language, key, values), [language])
  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t])
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}
