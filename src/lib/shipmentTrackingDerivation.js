function dateOf(value) {
  const date = value?.toDate?.() || (value instanceof Date ? value : typeof value === 'string' ? new Date(value) : typeof value?.seconds === 'number' ? new Date(value.seconds * 1000) : null)
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null
}

export function trackingDerivationLabels(derivation, language = 'de') {
  if (!derivation || typeof derivation !== 'object') return []
  const w = (de, en) => language === 'en' ? en : de
  const labels = []
  if (derivation.timeBasis === 'mail_just_arrived') labels.push(w('Mailzeit auf 5 Minuten abgerundet', 'Mail time rounded down to 5 minutes'))
  if (derivation.timeBasis === 'mail_already_arrived') labels.push(w('Ankunft erfolgt; genaue Zeit unbekannt. Ersatzzeit aus Mailzeit abgerundet.', 'Arrived; exact time unknown. Rounded mail time used as a placeholder.'))
  if (derivation.timeBasis === 'mail_arriving_soon') labels.push(w('ETA: Mailzeit aufgerundet + 15 Minuten', 'ETA: mail time rounded up + 15 minutes'))
  if (derivation.stationBasis === 'tracking_context') labels.push(w('Station aus Transportverlauf abgeleitet', 'Stop inferred from transport timeline'))
  return labels
}

export function trackingHistoryTimes(event, language = 'de') {
  const w = (de, en) => language === 'en' ? en : de
  const format = value => {
    const date = dateOf(value)
    return date ? new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'medium' }).format(date) : '—'
  }
  return [
    { key: 'event', label: w('Ereigniszeit', 'Event time'), value: format(event.eventTime) },
    { key: 'mail', label: w('Mail eingegangen', 'Mail received'), value: format(event.mailReceivedAt || event.derivation?.mailReceivedAt || event.originalAiDerivation?.mailReceivedAt) },
    { key: 'recorded', label: w('Übernommen / erfasst', 'Applied / recorded'), value: format(event.recordedAt) },
  ]
}


export function trackingEventDerivations(event, fields = null) {
  const entries = []
  const field = Array.isArray(event.changedFields) && event.changedFields.length === 1 ? event.changedFields[0] : null
  const include = candidate => !fields || !candidate || fields.includes(candidate)
  if (event.derivation && include(field)) entries.push({ kind: 'current', field, derivation: event.derivation })
  if (event.originalAiDerivation && include(field)) entries.push({ kind: 'original', field, derivation: event.originalAiDerivation })
  if (event.oldDerivation && include(field)) entries.push({ kind: 'previous', field, derivation: event.oldDerivation })
  for (const [previousField, derivation] of Object.entries(event.oldDerivations || {})) {
    if (include(previousField) && previousField !== (event.oldDerivation ? field : null)) entries.push({ kind: 'previous', field: previousField, derivation })
  }
  return entries.filter(entry => trackingDerivationLabels(entry.derivation).length)
}

export function trackingReviewProposals(updates) {
  return (Array.isArray(updates) ? updates : []).filter(update => update?.requiresConfirmation === true && update.applied !== true && typeof update.field === 'string' && typeof update.value === 'string' && trackingDerivationLabels(update.derivation).length)
}


export function trackingArrivalOutcomeLabel(forecast, language = 'de') {
  const w = (de, en) => language === 'en' ? en : de
  if (forecast?.arrivalTimeApproximate) return w('Ankunft erfolgt · genaue Zeit unbekannt', 'Arrived · exact time unknown')
  const state = forecast?.arrivalState || forecast?.state
  if (state === 'green') return w('Angekommen innerhalb des Entladefensters', 'Arrived within the unloading window')
  if (state === 'yellow') return w('Angekommen nach Ende des Entladefensters', 'Arrived after the unloading window')
  return w('Ankunft erfolgt · Pünktlichkeit unbekannt', 'Arrived · punctuality unknown')
}
