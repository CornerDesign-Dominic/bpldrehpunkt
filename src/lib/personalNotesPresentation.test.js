import test from 'node:test'
import assert from 'node:assert/strict'
import { formatPersonalNoteCreatedAt, personalNoteDraft, personalNoteValidation } from './personalNotesPresentation.js'

test('personal note drafts are trimmed and length-limited', () => {
  const draft = personalNoteDraft({ title: '  Meine Notiz  ', text: '  Inhalt  ' })
  assert.deepEqual(draft, { title: 'Meine Notiz', text: 'Inhalt' })
})

test('personal notes require both a title and text', () => {
  assert.equal(personalNoteValidation({ title: 'Titel', text: '' }).valid, false)
  assert.equal(personalNoteValidation({ title: 'Titel', text: 'Inhalt' }).valid, true)
})

test('personal note dates include the creation date and time', () => {
  assert.equal(formatPersonalNoteCreatedAt(new Date(2026, 8, 28, 7, 5)), '28.09.2026, 07:05')
})
