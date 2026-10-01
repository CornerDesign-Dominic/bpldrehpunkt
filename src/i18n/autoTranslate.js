import { autoOverrides } from './autoOverrides.js'
import { autoTranslations } from './autoTranslations.js'
import { normalizeLanguage } from './translations.js'

export function translateStatic(language, source) {
  if (normalizeLanguage(language) === 'de' || typeof source !== 'string') return source
  const translated = autoOverrides[source] ?? autoTranslations[source] ?? source
  if (/ (?:wird|werden) geladen\s*…$/.test(source)) {
    const match = translated.match(/^(.+?) (?:is|are) loaded\s*(?:\.\.\.|…)?$/i)
    if (match) return `Loading ${match[1]} …`
  }
  return translated
}
