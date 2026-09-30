export const PERSONAL_NOTE_TITLE_MAX_LENGTH = 140
export const PERSONAL_NOTE_TEXT_MAX_LENGTH = 12000
export const PERSONAL_NOTE_LEVELS = [
  { value: 'low', label: 'Niedrig' },
  { value: 'high', label: 'Hoch' },
]

export const PERSONAL_NOTE_SORT_OPTIONS = [
  { value: 'created-desc', label: 'Erstellungsdatum · neu zuerst' },
  { value: 'created-asc', label: 'Erstellungsdatum · alt zuerst' },
  { value: 'eisenhower', label: 'Eisenhower · wichtig und dringend zuerst' },
]

function text(value) {
  return typeof value === 'string' ? value : ''
}

function noteLevel(value) {
  return value === 'high' ? 'high' : 'low'
}

export function personalNoteDraft(values = {}) {
  return {
    title: text(values.title).trim().slice(0, PERSONAL_NOTE_TITLE_MAX_LENGTH),
    text: text(values.text).trim().slice(0, PERSONAL_NOTE_TEXT_MAX_LENGTH),
    importance: noteLevel(values.importance),
    urgency: noteLevel(values.urgency),
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

function timestampValue(value) {
  const date = dateValue(value)
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0
}

function eisenhowerRank(note) {
  if (note.importance === 'high' && note.urgency === 'high') return 0
  if (note.importance === 'high') return 1
  if (note.urgency === 'high') return 2
  return 3
}

export function sortPersonalNotes(notes, sort = 'created-desc') {
  return [...notes].sort((left, right) => {
    const createdDifference = timestampValue(right.createdAt) - timestampValue(left.createdAt)
    if (sort === 'created-asc') return -createdDifference
    if (sort !== 'eisenhower') return createdDifference
    return eisenhowerRank(left) - eisenhowerRank(right) || createdDifference
  })
}

export function formatPersonalNoteCreatedAt(value) {
  const date = dateValue(value)
  if (!date || Number.isNaN(date.getTime())) return 'Wird gespeichert …'
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date)
}
