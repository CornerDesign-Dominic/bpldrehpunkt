import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultLanguage, localeForLanguage, normalizeLanguage, translate, translations } from './translations.js'
import { translateStatic } from './autoTranslate.js'

test('all interface keys have German and English text', () => {
  assert.deepEqual(Object.keys(translations.en).sort(), Object.keys(translations.de).sort())
  for (const [language, catalog] of Object.entries(translations)) {
    for (const [key, value] of Object.entries(catalog)) {
      assert.ok(value.trim(), `${language}:${key} is empty`)
    }
  }
})

test('unknown and missing languages fall back to German', () => {
  assert.equal(defaultLanguage, 'de')
  assert.equal(normalizeLanguage(undefined), 'de')
  assert.equal(normalizeLanguage('fr'), 'de')
  assert.equal(translate('fr', 'nav.signOut'), 'Abmelden')
  assert.equal(localeForLanguage('en'), 'en-GB')
  assert.equal(localeForLanguage('fr'), 'de-DE')
})

test('translations interpolate labels without changing user content', () => {
  assert.equal(translate('en', 'nav.addFavorite', { label: 'Müller GmbH' }), 'Add Müller GmbH to favorites')
})

test('static interface translations retain the German default and reviewed terms', () => {
  assert.equal(translateStatic('de', 'Bearbeiten'), 'Bearbeiten')
  assert.equal(translateStatic('en', 'Bearbeiten'), 'Edit')
  assert.equal(translateStatic('en', 'Erinnerung'), 'Reminder')
  assert.equal(translateStatic('en', 'In Regulierung'), 'Being settled')
  assert.equal(translateStatic('en', 'Müller GmbH'), 'Müller GmbH')
  const value = { name: 'Müller GmbH' }
  assert.equal(translateStatic('en', value), value)
})
