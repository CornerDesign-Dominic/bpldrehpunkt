const labels = {
  vacation_pending: 'Urlaub angefragt', vacation_approved: 'Urlaub genehmigt', vacation_rejected: 'Urlaub abgelehnt', vacation_withdrawn: 'Urlaubsanfrage zurückgezogen',
  cancellation_pending: 'Storno angefragt', cancellation_approved: 'Storno genehmigt', cancellation_rejected: 'Storno abgelehnt', cancellation_withdrawn: 'Stornoantrag zurückgezogen',
  change_pending: 'Änderung angefragt', change_approved: 'Änderung genehmigt', change_rejected: 'Änderung abgelehnt', change_withdrawn: 'Änderungsantrag zurückgezogen',
  vacation_replaced: 'Antrag überarbeitet',
}

export function vacationHistoryLabel(eventType) { return labels[eventType] || 'Status aktualisiert' }
export function formatVacationHistoryDate(value) { const date = value?.toDate?.() || (value ? new Date(value) : null); return date && !Number.isNaN(date.getTime()) ? `${new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(date)} Uhr` : '—' }
export function vacationHistoryActor(entry, people = []) { const person = people.find((item) => item.id === entry.createdBy); return entry.createdByName || [person?.firstName, person?.lastName].filter(Boolean).join(' ') || person?.name || '' }
