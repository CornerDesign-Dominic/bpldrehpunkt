import test from 'node:test'
import assert from 'node:assert/strict'
import { formatPersonalNoteCreatedAt, personalNoteDraft, personalNoteValidation, sortPersonalNotes } from './personalNotesPresentation.js'

test('personal note drafts are trimmed and length-limited', () => {
  const draft = personalNoteDraft({ title: '  Meine Notiz  ', text: '  Inhalt  ' })
  assert.deepEqual(draft, { title: 'Meine Notiz', text: 'Inhalt', importance: 'low', urgency: 'low' })
})

test('personal notes require both a title and text', () => {
  assert.equal(personalNoteValidation({ title: 'Titel', text: '' }).valid, false)
  assert.equal(personalNoteValidation({ title: 'Titel', text: 'Inhalt' }).valid, true)
})

test('personal note dates include the creation date and time', () => {
  assert.equal(formatPersonalNoteCreatedAt(new Date(2026, 8, 28, 7, 5)), '28.09.2026, 07:05')
})

test('Eisenhower sorting keeps important and urgent notes first', () => {
  const notes = [
    { id: 'low', importance: 'low', urgency: 'low', createdAt: new Date('2026-09-28T09:00:00') },
    { id: 'urgent', importance: 'low', urgency: 'high', createdAt: new Date('2026-09-28T10:00:00') },
    { id: 'both', importance: 'high', urgency: 'high', createdAt: new Date('2026-09-28T08:00:00') },
    { id: 'important', importance: 'high', urgency: 'low', createdAt: new Date('2026-09-28T11:00:00') },
  ]
  assert.deepEqual(sortPersonalNotes(notes, 'eisenhower').map((note) => note.id), ['both', 'important', 'urgent', 'low'])
})
