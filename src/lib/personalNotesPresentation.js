export const PERSONAL_NOTE_TITLE_MAX_LENGTH = 140
export const PERSONAL_NOTE_TEXT_MAX_LENGTH = 12000

function text(value) {
  return typeof value === 'string' ? value : ''
}

export function personalNoteDraft(values = {}) {
  return {
    title: text(values.title).trim().slice(0, PERSONAL_NOTE_TITLE_MAX_LENGTH),
    text: text(values.text).trim().slice(0, PERSONAL_NOTE_TEXT_MAX_LENGTH),
  }
}

export function personalNoteValidation(values = {}) {
  const draft = personalNoteDraft(values)
  if (!draft.title) return { valid: false, message: 'Bitte einen Titel eingeben.', values: draft }
  if (!draft.text) return { valid: false, message: 'Bitte einen Notiztext eingeben.', values: draft }
  return { valid: true, message: '', values: draft }
}

function dateValue(value) {
  if (value?.toDate) return value.toDate()
  return value instanceof Date ? value : null
}

export function formatPersonalNoteCreatedAt(value) {
  const date = dateValue(value)
  if (!date || Number.isNaN(date.getTime())) return 'Wird gespeichert …'
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date)
}
