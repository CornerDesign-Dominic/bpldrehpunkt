import { businessPartnerDetailPath } from './businessPartnerLinks.js'

const resultLabels = {
  created: 'Neuer Partner angelegt',
  updated: 'Bestehenden Partner aktualisiert',
  debtorAdded: 'Debitorennummer ergänzt',
  creditorAdded: 'Kreditorennummer ergänzt',
  reviewed: 'Nach Prüfung übernommen',
  merged: 'Partner zusammengeführt',
  unchanged: 'Keine Stammdatenänderung',
  legacyUnknown: 'Ergebnis historisch nicht protokolliert',
}

export function customerImportResultView(row) {
  const partner = row.affectedPartner
  const partnerId = partner?.id || row.customerId || row.carrierId || row.result?.partnerId || ''
  const assignment = row.result?.assignment || { kind: 'unknown' }
  const matchBasis = assignment.kind === 'debtor' ? `exakte Debitorennummer ${assignment.number}`
    : assignment.kind === 'creditor' ? `exakte Kreditorennummer ${assignment.number}`
      : assignment.kind === 'merge' ? 'Zusammenführung'
        : assignment.kind === 'new' ? 'Neuanlage ohne vorhandene Nummer' : 'Historisch nicht protokolliert'
  const match = row.result?.actions?.includes('reviewed') && assignment.kind !== 'merge' ? `${matchBasis} · manuelle Prüfung` : matchBasis
  return {
    labels: (row.result?.actions || []).map((action) => resultLabels[action]).filter(Boolean),
    match,
    partnerName: partner?.companyName || (partner ? 'Ohne Firmennamen' : 'Stammdatenblatt nicht verfügbar'),
    partnerId,
    partnerPath: partner?.id ? businessPartnerDetailPath(partner.id) : null,
  }
}

const historyTitles = {
  merged: 'Partner zusammengeführt',
  created: 'Neuer Partner angelegt',
  debtorAdded: 'Nummer ergänzt',
  creditorAdded: 'Nummer ergänzt',
  updated: 'Stammdaten ergänzt',
  reviewed: 'Nach Prüfung übernommen',
  unchanged: 'Keine neuen Daten übernommen',
}

export function customerImportHistoryRowView(row) {
  const view = customerImportResultView(row)
  const actions = row.result?.actions || []
  const action = ['merged', 'created', 'debtorAdded', 'creditorAdded', 'updated', 'reviewed', 'unchanged'].find((candidate) => actions.includes(candidate))
  return {
    ...view,
    title: historyTitles[action] || 'Übernahme dokumentiert',
    tone: action === 'unchanged' ? 'neutral' : action === 'merged' ? 'merge' : 'success',
    approval: row.approval?.type === 'reviewed' ? 'geprüft' : 'automatisch',
    debtor: row.debtorNumber || '—',
  }
}

function timestampMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis()
  if (typeof value?.toDate === 'function') return value.toDate().getTime()
  if (typeof value?.seconds === 'number') return value.seconds * 1000
  if (typeof value?._seconds === 'number') return value._seconds * 1000
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Date.parse(value) || 0
  return 0
}

export function customerImportHistoryGroups(rows, runs = {}) {
  const groups = new Map()
  for (const row of rows) {
    const runId = String(row.runId || '').trim()
    const key = runId ? `run:${runId}` : 'legacy'
    if (!groups.has(key)) groups.set(key, { key, runId, rows: [], automatic: 0, reviewed: 0, timestamp: 0 })
    const group = groups.get(key)
    group.rows.push(row)
    if (row.approval?.type === 'reviewed') group.reviewed += 1
    else group.automatic += 1
    group.timestamp = Math.max(group.timestamp, timestampMillis(row.lastImportedAt || row.createdAt || row.approval?.at))
  }
  return [...groups.values()].map((group) => {
    const run = group.runId ? runs[group.runId] : null
    return {
      ...group,
      fileName: group.runId ? run?.fileName || group.rows[0].fileName || 'Importlauf ohne Dateiname' : 'Frühere Übernahmen',
      timestamp: timestampMillis(run?.importedAt) || group.timestamp,
      importedByName: run?.importedByName || '',
    }
  }).sort((left, right) => Number(left.key === 'legacy') - Number(right.key === 'legacy') || right.timestamp - left.timestamp || left.key.localeCompare(right.key))
}

export function customerImportHistoryDate(timestamp) {
  return timestamp ? new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(timestamp) : ''
}
