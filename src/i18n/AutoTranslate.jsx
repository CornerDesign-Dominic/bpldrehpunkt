import { cloneElement } from 'react'
import { useLanguage } from './useLanguage.js'
import { translateStatic } from './autoTranslate.js'

export function StaticText({ source }) {
  const { language } = useLanguage()
  return translateStatic(language, source)
}

export function TranslatedProps({ children, sources }) {
  const { language } = useLanguage()
  const props = Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, translateStatic(language, source)]))
  return cloneElement(children, props)
}
