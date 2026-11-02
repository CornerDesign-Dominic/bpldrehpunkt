export const PHASES = ['plan', 'do', 'check', 'act']
export const SMART_FIELDS = [
  { key: 'smartSpecific', letter: 'S', de: 'Spezifisch', en: 'Specific' },
  { key: 'smartMeasurable', letter: 'M', de: 'Messbar', en: 'Measurable' },
  { key: 'smartAchievable', letter: 'A', de: 'Erreichbar', en: 'Achievable' },
  { key: 'smartRelevant', letter: 'R', de: 'Relevant', en: 'Relevant' },
  { key: 'smartTimeBound', letter: 'T', de: 'Terminiert', en: 'Time-bound' },
]
export const TOPIC_FIELDS = ['title', 'status', 'goal', 'measure', 'owner', 'startDate', 'dueDate', 'cycleStartDate', 'actDecision', 'actDate', ...SMART_FIELDS.map((field) => field.key), ...PHASES]
export const HANDBOOK_FIELDS = ['title', 'process', 'situation', 'consequences', 'action', 'prevention', 'lastReviewedDate', 'nextReviewDate', 'owner']
export const MEETING_FIELDS = ['title', 'date', 'participants', 'notes']
export const HANDBOOK_SECTIONS = ['situation', 'consequences', 'action', 'prevention']

export function qualityToday() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

export function isQualityReviewOverdue(record, today = qualityToday()) {
  return Boolean(record.nextReviewDate && record.nextReviewDate < today)
}

export function groupHandbookCatalog(records, { departmentId = '', search = '' } = {}) {
  const filtered = searchQualityRecords(records.filter((record) => !departmentId || record.departmentId === departmentId), search)
  const chapters = new Map()
  for (const article of filtered) {
    const chapter = article.process
    if (!chapters.has(chapter)) chapters.set(chapter, [])
    chapters.get(chapter).push(article)
  }
  return [...chapters].sort(([left], [right]) => left.localeCompare(right)).map(([chapter, articles]) => ({ chapter, articles: [...articles].sort((left, right) => left.title.localeCompare(right.title)) }))
}

export function qualitySmartValues(record) {
  return { smartSpecific: record.smartSpecific ?? record.goal ?? '', smartMeasurable: record.smartMeasurable ?? record.measure ?? '', smartAchievable: record.smartAchievable ?? '', smartRelevant: record.smartRelevant ?? '', smartTimeBound: record.smartTimeBound ?? '' }
}

export function qualityMeetingUrl(id, topicId) {
  if (typeof id !== 'string' || !id) throw new TypeError('A meeting ID is required')
  return `/qualitaet/kvp/besprechungen/${encodeURIComponent(id)}${topicId ? `?${new URLSearchParams({ topic: topicId })}` : ''}`
}

export function qualityMeetingsOverviewUrl(departmentId) {
  const search = new URLSearchParams({ view: 'meetings' })
  if (departmentId) search.set('department', departmentId)
  return `/qualitaet/kvp?${search}`
}

export function qualityHandbookUrl(id) {
  if (typeof id !== 'string' || !id) throw new TypeError('A handbook entry ID is required')
  return `/qualitaet/handbuch/${encodeURIComponent(id)}`
}

export function qualityHandbookOverviewUrl(departmentId) {
  return `/qualitaet/handbuch${departmentId ? `?${new URLSearchParams({ department: departmentId })}` : ''}`
}

export function qualityValues(kind, record = {}, departmentId = '') {
  const fields = kind === 'topic' ? TOPIC_FIELDS : kind === 'handbook' ? HANDBOOK_FIELDS : MEETING_FIELDS
  const values = Object.fromEntries(fields.map((key) => [key, record[key] || '']))
  values.departmentId = record.departmentId || departmentId
  if (kind === 'topic') {
    values.status = record.status || 'active'; values.cycle = record.cycle || 1
    Object.assign(values, qualitySmartValues(record))
    values.cycleStartDate = record.cycleStartDate ?? (!record.revision ? qualityToday() : '')
  }
  if (kind === 'meeting') values.topicIds = [...(record.topicIds || [])]
  return values
}

export function nextQualityCycle(values) {
  return { ...values, cycle: values.cycle + 1, status: 'active', plan: '', do: '', check: '', act: '', goal: '', measure: '', startDate: '', dueDate: '', cycleStartDate: qualityToday(), actDecision: '', actDate: '', ...Object.fromEntries(SMART_FIELDS.map(({ key }) => [key, ''])) }
}

// A cycle is a business iteration; a revision is one saved edit within it.
// Existing immutable revisions already contain complete cycle snapshots.
export function groupQualityCycles(record, revisions = []) {
  if (!record) return []
  if (!Array.isArray(revisions)) throw new TypeError('Invalid PDCA revision history')
  const cycles = new Map()
  for (const snapshot of [...revisions, record]) {
    if (!snapshot || !Number.isSafeInteger(snapshot.cycle) || snapshot.cycle < 1 || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 1) {
      throw new TypeError('Invalid PDCA cycle or revision number')
    }
    const previous = cycles.get(snapshot.cycle)
    if (!previous || snapshot.revision >= previous.revision) cycles.set(snapshot.cycle, { ...snapshot, id: record.id })
  }
  return [...cycles.values()].sort((left, right) => right.cycle - left.cycle)
}

export function qualityTopicUrl(id, { departmentId, phase } = {}) {
  if (typeof id !== 'string' || !id) throw new TypeError('A problem ID is required')
  const search = new URLSearchParams()
  if (departmentId) search.set('department', departmentId)
  if (PHASES.includes(phase)) search.set('phase', phase)
  const query = search.toString()
  return `/qualitaet/kvp/${encodeURIComponent(id)}${query ? `?${query}` : ''}`
}

export function qualityOverviewUrl(departmentId) {
  const search = new URLSearchParams()
  if (departmentId) search.set('department', departmentId)
  const query = search.toString()
  return `/qualitaet/kvp${query ? `?${query}` : ''}`
}

export function searchQualityRecords(records, search) {
  const term = search.trim().toLocaleLowerCase()
  return records.filter((record) => !term || Object.values(record).some((value) => typeof value === 'string' && value.toLocaleLowerCase().includes(term)))
}
