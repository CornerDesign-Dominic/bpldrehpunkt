export const releaseNotes = [
  {
    version: '1.1.0',
    title: 'Import & vernetzte Stammdaten',
    status: 'preview',
    publishedAt: null,
    releaseId: null,
    commit: null,
    intro: 'Neue Importwege und besser verknüpfte Stammdaten erleichtern die tägliche Arbeit mit Partnern und Transportaufträgen.',
    sections: [
      { category: 'Neu', title: 'Stammdatenimport', items: ['Kunden und Unternehmer können aus DyCoS-CSV importiert, geprüft und übernommen werden.'] },
      { category: 'Neu', title: 'Transportaufträge', items: ['Transportaufträge können importiert, in einer Liste verwaltet und mit weiteren Modulen verknüpft werden.'] },
      { category: 'Neu', title: 'Partner zusammenführen', items: ['Debitoren- und Kreditorennummern können einem gemeinsamen Partner zugeordnet werden.', 'Zusammenführungen, zusätzliche Nummern und Weiterleitungen sind nachvollziehbar; Partner können kontrolliert wieder getrennt werden.'] },
      { category: 'Verbessert', title: 'Stammdaten und Zuordnungen', items: ['Importwege, Prüfentscheidungen, Nummern und Partnerzuordnungen werden transparenter dargestellt.'] },
      { category: 'Kleinere Verbesserungen', title: '', items: ['Stabilität, Rechteprüfung, Datenintegrität und Importprüfung verbessert.'] },
    ],
  },
  {
    version: '1.0.0',
    title: 'Erstveröffentlichung von Drehpunkt',
    status: 'published',
    publishedAt: '2026-09-20',
    releaseId: 'v1.0.0',
    commit: '40bea56184344e1236fc88db281e234f18d8f11d',
    intro: 'Die erste veröffentlichte Version von Drehpunkt steht für die tägliche Arbeit bereit.',
    sections: [
      { category: 'Neu', title: 'Drehpunkt', items: ['Erste gemeinsame Arbeitsoberfläche für die freigegebenen Bereiche.'] },
    ],
  },
]

const versionParts = (version) => String(version).split('.').map((part) => Number(part) || 0)
const isPublished = (note) => note.status === 'published' && /^\d{4}-\d{2}-\d{2}$/.test(note.publishedAt || '') && Boolean(note.releaseId) && /^[0-9a-f]{40}$/i.test(note.commit || '')

export function visibleReleaseNotes(notes, { production = false } = {}) {
  return notes
    .filter((note) => isPublished(note) || (!production && note.status === 'preview'))
    .sort((left, right) => {
      const a = versionParts(left.version); const b = versionParts(right.version)
      for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
        if ((a[index] || 0) !== (b[index] || 0)) return (b[index] || 0) - (a[index] || 0)
      }
      return 0
    })
}

export function formatReleaseDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return 'Noch nicht veröffentlicht'
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(`${date}T12:00:00`))
}

export const isProductionReleaseTarget = (projectId) => projectId === 'db-bpl-drehpunkt'
