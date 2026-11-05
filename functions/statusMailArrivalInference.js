const FIVE_MINUTES = 5 * 60000
const arrivalFields = new Set(['actualArrivalLoadingAt', 'actualArrivalUnloadingAt', 'estimatedArrivalLoadingAt', 'estimatedArrivalUnloadingAt'])
const loadingContextFields = ['actualArrivalLoadingAt', 'loadingStartedAt', 'loadingCompletedAt', 'estimatedDepartureLoadingAt', 'actualDepartureLoadingAt']
const bases = new Set(['explicit', 'mail_just_arrived', 'mail_already_arrived', 'mail_arriving_soon'])
const normalize = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE') : ''
const dateOf = value => { const raw = value?.toDate?.() || value; const date = raw instanceof Date ? raw : typeof raw === 'string' ? new Date(raw) : null; return date && Number.isFinite(date.getTime()) ? date : null }

export function relativeArrivalTime(received, basis) {
  const time = dateOf(received)?.getTime()
  if (!Number.isFinite(time) || !bases.has(basis) || basis === 'explicit') return null
  return new Date(basis === 'mail_arriving_soon' ? Math.ceil(time / FIVE_MINUTES) * FIVE_MINUTES + 15 * 60000 : Math.floor(time / FIVE_MINUTES) * FIVE_MINUTES)
}

// Only the latest author text can justify a newly proposed fact. A literal
// excerpt in old quoted correspondence is not evidence of the current status.
export function currentArrivalText(mail) {
  return String(mail?.bodyText || '').split(/\n\s*(?:mit freundlichen gr(?:ü|ue)ßen|best regards|regards[,!]?|(?:von|from|de|od):|[- ]{3,}(?:original (?:message|nachricht)|forwarded message)|on .+wrote:|am .+schrieb)/i)[0].split('\n').filter(line => !/^\s*>/.test(line)).join('\n')
}

export function isCurrentArrivalStatement(evidence, mail) {
  const line = normalize(evidence)
  const source = normalize(currentArrivalText(mail))
  if (!line || !source.includes(line)) return false
  return !/[?？]/.test(line) && !/\b(?:please|bitte)\s+(?:confirm|tell|let|report|advise|bestätigen|mitteilen|melden|sagen|informieren)\b/i.test(line) && !/\b(?:nicht|noch nicht|not|hasn[’']t|haven[’']t|isn[’']t|didn[’']t|never|wann|when|whether|ob|wenn|falls|sobald|if|once|kiedy|czy|nie|pas|jamais|non|nunca)\b/i.test(line)
}

function relativeMeaning(evidence, basis) {
  const line = normalize(evidence)
  const soon = /(?:kommt|kommen|ist|sind) gleich|gleich (?:da|vor ort)|in kürze|(?:arriv|coming|be there).{0,25}(?:soon|shortly)|(?:soon|shortly).{0,25}(?:arriv|there)|zaraz|wkrótce|bient[oô]t|sta per arrivare|uskoro/i.test(line)
  if (basis === 'mail_arriving_soon') return soon
  if (soon || /\b(?:morgen|tomorrow|gestern|yesterday|wczoraj|jutro|hier|demain)\b/i.test(line)) return false
  const arrived = /angekommen|eingetroffen|vor ort|(?:ist|sind) da|arrived|on site|przyjecha|dotar|na miejscu|ajuns|sosit|arriv[eé]|sur place|llegad|arrivat|stigao|stigli|прибыл|пристигао/i.test(line)
  const just = /\b(?:gerade|soeben|eben|just|właśnie|appena|upravo)\b|vient d|только что/i.test(line)
  return arrived && (basis === 'mail_just_arrived' ? just : !just)
}

function explicitStation(evidence, mail, order) {
  const loadingCity = normalize(order?.imported?.loading?.city)
  const unloadingCity = normalize(order?.imported?.unloading?.city)
  const stationIn = source => {
    const line = normalize(source)
    const unloading = /entlad|unload|delivery (?:site|point)|consignee|rozład|descar|descarg|scarico|décharg/i.test(line)
    const loadingText = line.replace(/entlad[\p{L}]*|unload[\p{L}]*|rozład[\p{L}]*|décharg[\p{L}]*|descar[\p{L}]*|descarg[\p{L}]*|scarico/giu, '')
    const loading = /(?:^|[^a-z])ladestelle|belad|(?:^|[^a-z])load(?:ing)?|pickup|pick-up|załad|carreg|carg|carico|chargement/i.test(loadingText)
    const load = loading || Boolean(loadingCity && line.includes(loadingCity))
    const unload = unloading || Boolean(unloadingCity && line.includes(unloadingCity))
    return { named: load || unload, station: load === unload ? null : unload ? 'unloading' : 'loading' }
  }
  // The assertion's own station takes priority over a different earlier clause
  // about loading. Only a station-less excerpt needs surrounding author context.
  const excerpt = stationIn(evidence)
  return excerpt.named ? excerpt.station : stationIn(currentArrivalText(mail)).station
}

export function storedArrivalDerivation(value) {
  if (!value || !bases.has(value.timeBasis) || !['explicit', 'tracking_context'].includes(value.stationBasis)) return null
  const received = dateOf(value.mailReceivedAt)
  if (!received) return null
  return { timeBasis: value.timeBasis, stationBasis: value.stationBasis, basedOnFields: Array.isArray(value.basedOnFields) ? value.basedOnFields.filter(field => loadingContextFields.includes(field)).slice(0, 5) : [], mailReceivedAt: received.toISOString(), timingApproximate: value.timingApproximate === true, ruleVersion: 1 }
}

export function arrivalDerivation(update, mail, { tracking, order } = {}) {
  const timeBasis = update.timeBasis || 'explicit'
  const stationBasis = update.stationBasis || 'explicit'
  if (!bases.has(timeBasis) || !['explicit', 'tracking_context'].includes(stationBasis)) return null
  if (!isCurrentArrivalStatement(update.evidence, mail)) return null
  const received = dateOf(mail.receivedAt)
  if (!received) return null
  const relative = timeBasis !== 'explicit'
  if (relative && (!arrivalFields.has(update.field) || !relativeMeaning(update.evidence, timeBasis))) return null
  if (relative && (update.field.startsWith('estimated') !== (timeBasis === 'mail_arriving_soon'))) return null
  // An explicit clock or duration in the excerpt must not be silently replaced
  // by a timestamp derived from when the message happened to arrive.
  if (relative && /\b\d{1,2}[:.]\d{2}\b|\b\d{1,2}\s*(?:uhr|h|am|pm|minutes?|minuten|stunden|hours?)\b/i.test(update.evidence)) return null
  const target = update.field.includes('Unloading') ? 'unloading' : 'loading'
  const named = explicitStation(update.evidence, mail, order)
  if (named && named !== target) return null
  let basedOnFields = []
  if (stationBasis === 'explicit') {
    if (relative && named !== target) return null
  } else {
    if (!arrivalFields.has(update.field) || target !== 'unloading' || tracking?.lifecycleStatus === 'completed' || dateOf(tracking?.unloadingCompletedAt)) return null
    const requested = Array.isArray(update.contextFields) ? [...new Set(update.contextFields)] : []
    if (!requested.length || requested.some(field => !loadingContextFields.includes(field))) return null
    basedOnFields = requested.filter(field => {
      const at = dateOf(tracking?.[field]), source = tracking?.fieldSources?.[field]
      return at && at < received && source?.requiresConfirmation !== true && source?.derivation?.timingApproximate !== true && (!source?.derivation || Boolean(source.confirmedBy))
    })
    if (basedOnFields.length !== requested.length) return null
    // A newer confirmed departure must never be dated after the proposed actual
    // arrival. The caller applies this once the explicit/relative time is known.
  }
  if (!relative && stationBasis === 'explicit') return null
  return { timeBasis, stationBasis, basedOnFields, mailReceivedAt: received.toISOString(), timingApproximate: relative, ruleVersion: 1 }
}

export function arrivalChronologyFits(field, value, tracking) {
  if (!arrivalFields.has(field)) return true
  const proposed = dateOf(value)
  if (!proposed) return false
  const priorFields = field.includes('Unloading') ? ['actualDepartureLoadingAt', 'loadingCompletedAt'] : []
  return priorFields.every(key => { const previous = dateOf(tracking?.[key]); return !previous || previous <= proposed })
}
