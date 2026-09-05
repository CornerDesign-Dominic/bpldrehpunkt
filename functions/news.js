import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { defineSecret } from 'firebase-functions/params'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { logger } from 'firebase-functions'
import { hasActiveProfile, requireActiveProfile, requireRole } from './access.js'

function database() { return getFirestore() }
const openAiApiKey = defineSecret('OPENAI_API_KEY')
const powerAutomateNotificationUrl = defineSecret('POWER_AUTOMATE_NOTIFICATION_URL')

const CATEGORIES = new Set(['traffic_infrastructure', 'law_regulations', 'logistics_market'])
const LEGACY_CATEGORY_MAPPINGS = {
  highway: 'traffic_infrastructure',
  law: 'law_regulations',
  logistics: 'logistics_market',
}
const PRIORITIES = new Set(['information', 'notice', 'important'])
const COUNTRIES = new Set(['DE', 'NL', 'BE', 'LU', 'FR', 'PL', 'AT', 'CH', 'CZ', 'IT', 'ES', 'DK', 'UK', 'EU'])
const AFFECTS = new Set(['dispatch', 'accounting', 'personnel', 'management', 'it'])
const TAGS_BY_CATEGORY = {
  traffic_infrastructure: new Set(['construction', 'road_closure', 'driving_ban', 'toll', 'border_disruption', 'strike', 'port_ferry', 'rail_terminal', 'weather']),
  law_regulations: new Set(['transport_law', 'accounting_taxes', 'personnel_social', 'customs_foreign_trade', 'environment', 'eu_law', 'case_law']),
  logistics_market: new Set(['market_prices', 'capacity', 'partners_insolvencies', 'industry_development', 'operational_disruption']),
}
const MAX_ITEMS_PER_RUN = 7
const MAX_RECHECKS_PER_RUN = 12
const NEWS_STATUSES = new Set(['active', 'resolved', 'openEnded'])
const NEWS_REACTIONS = new Set(['helpful', 'notHelpful'])

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function cleanUrl(value) {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return ''
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('utm_')) url.searchParams.delete(key)
    }
    return url.toString()
  } catch {
    return ''
  }
}

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00Z`).getTime())
}

function responseText(response) {
  if (typeof response.output_text === 'string') return response.output_text
  return (response.output || [])
    .flatMap((output) => output.content || [])
    .filter((content) => content.type === 'output_text' && typeof content.text === 'string')
    .map((content) => content.text)
    .join('\n')
}

function parseCandidates(response) {
  const text = responseText(response).trim()
  if (!text) throw new Error('OpenAI hat keine auswertbare Antwort geliefert.')
  const parsed = JSON.parse(text)
  return Array.isArray(parsed.items) ? parsed.items : []
}

function dateToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date())
}

function researchPrompt() {
  const today = dateToday()
  return [
    'Du bist der externe News-Redakteur der Brennpunkt Logistik GmbH in Deutschland.',
    `Heute ist ${today}. Recherchiere mit der Websuche ausschließlich Meldungen, die für eine mittelständische deutsche Spedition ohne eigenen Fuhrpark konkret relevant sind.`,
    'Kernländer sind DE, NL, BE, LU, FR, PL, AT und CH. Berücksichtige CZ, IT, ES, DK, UK sowie EU-weite Regelungen nur bei konkreter Relevanz für diese Kernländer oder grenzüberschreitende Transporte.',
    'Prüfe besonders: Maut, Fahrverbote, große Verkehrs- und Infrastrukturbeeinträchtigungen sowie relevante Entwicklungen bei Straße, Autobahn, Bahn, Häfen, Fähren, Terminals und Grenzen, wenn sie Straßenverkehr, Kapazitäten, Laufzeiten oder Transportkosten beeinflussen können; außerdem EU-/nationale Transport- und Arbeitsrechtsregeln, Zoll, Gefahrgut, Branchenentwicklungen sowie bedeutende Cyber- oder IT-Warnungen für Logistikunternehmen.',
    'Nimm nur belegte Meldungen der letzten sieben Tage oder verbindliche, bereits veröffentlichte Ankündigungen mit einem klaren künftigen Stichtag auf.',
    'Ignoriere allgemeine Marktkommentare, kleine lokale Störungen, PR-Meldungen ohne konkrete Auswirkung und bereits länger bekannte Inhalte.',
    'Arbeite ausschließlich mit verlässlichen Primärquellen, Behörden, Infrastrukturbetreibern, anerkannten Verbänden oder ergänzend seriöser Fachpresse. Nutze keine Blogs, Social Media, PR-Meldungen oder allgemeinen Marktkommentare. Jede Meldung braucht eine direkte Quell-URL und darf ohne Quelle nicht ausgegeben werden.',
    'Ordne exakt einer Kategorie zu: traffic_infrastructure (Verkehr & Infrastruktur: Straße, Autobahn, Maut, Fahrverbote sowie relevante Bahn-, Hafen-, Fähr-, Terminal- und Grenzthemen), law_regulations (Recht & Vorgaben: Gesetze, Zoll, Compliance) oder logistics_market (Logistik & Markt: Branche, operative Logistik, Markt sowie IT-/Sicherheitsthemen).',
    'Bewerte priority als information, notice oder important. important ausschließlich bei Frist oder Pflicht, zentraler Verkehrsbeeinträchtigung, deutlicher Kostenwirkung oder unmittelbarem Handlungsbedarf.',
    'Ordne 1–3 passende Themen-Tags zu. Betroffene Länder und betrifft-Werte gib nur aus, wenn sie aus Inhalt und operativer Auswirkung konkret ableitbar sind; ansonsten jeweils ein leeres Array. Erlaubte Länder sind DE, NL, BE, LU, FR, PL, AT, CH, CZ, IT, ES, DK, UK und EU.',
    'Erlaubte Themen-Tags: traffic_infrastructure = construction, road_closure, driving_ban, toll, border_disruption, strike, port_ferry, rail_terminal, weather; law_regulations = transport_law, accounting_taxes, personnel_social, customs_foreign_trade, environment, eu_law, case_law; logistics_market = market_prices, capacity, partners_insolvencies, industry_development, operational_disruption. Erlaubte betrifft-Werte: dispatch, accounting, personnel, management, it.',
    'Titel auf Deutsch und höchstens 110 Zeichen: konkret, operativ und sofort verständlich mit Auswirkung, Ort und gegebenenfalls Zeitpunkt. Keine Quellenbezeichnung, Floskeln oder langen Satz-Titel. summary für die geschlossene Card höchstens 260 Zeichen und ausschließlich konkrete Änderung oder Auswirkung. content höchstens 900 Zeichen, nüchtern, belegt und ohne Wiederholungen. Handlungshinweise nur als konkreter, belegbarer „Nächster Schritt“. Erfasse validFrom und validUntil ausschließlich als YYYY-MM-DD, wenn sie in der Quelle klar belegt sind; bei unklarer Zeitangabe niemals ein Datum erfinden, sondern status openEnded oder active verwenden. status ist active, resolved oder openEnded.',
    'Wenn keine wirklich relevante neue Meldung vorliegt, gib ein leeres items-Array zurück.',
  ].join('\n')
}

const newsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'summary', 'content', 'category', 'priority', 'source', 'sourceUrl', 'publishedAt', 'validFrom', 'validUntil', 'status', 'relevance', 'affectedCountries', 'topicTags', 'affects'],
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
          content: { type: 'string' },
          category: { type: 'string', enum: ['traffic_infrastructure', 'law_regulations', 'logistics_market'] },
          priority: { type: 'string', enum: ['information', 'notice', 'important'] },
          source: { type: 'string' },
          sourceUrl: { type: 'string' },
          publishedAt: { type: 'string' },
          validFrom: { type: 'string' },
          validUntil: { type: 'string' },
          status: { type: 'string', enum: ['active', 'resolved', 'openEnded'] },
          relevance: { type: 'integer' },
          affectedCountries: { type: 'array', items: { type: 'string', enum: [...COUNTRIES] } },
          topicTags: { type: 'array', items: { type: 'string', enum: Object.values(TAGS_BY_CATEGORY).flatMap((tags) => [...tags]) } },
          affects: { type: 'array', items: { type: 'string', enum: [...AFFECTS] } },
        },
      },
    },
  },
}

const newsReviewSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'outcome', 'status', 'validFrom', 'validUntil', 'summary', 'source', 'sourceUrl'],
        properties: {
          id: { type: 'string' },
          outcome: { type: 'string', enum: ['unchanged', 'update'] },
          status: { type: 'string', enum: ['active', 'resolved', 'openEnded', 'unchanged'] },
          validFrom: { type: 'string' },
          validUntil: { type: 'string' },
          summary: { type: 'string' },
          source: { type: 'string' },
          sourceUrl: { type: 'string' },
        },
      },
    },
  },
}

function reactionsAllowed(item) {
  return item?.sourceType === 'external' || item?.reactionsAllowed !== false
}

function reactionCounts(item) {
  const counts = item?.reactionCounts || {}
  return {
    helpful: Number.isInteger(counts.helpful) && counts.helpful > 0 ? counts.helpful : 0,
    notHelpful: Number.isInteger(counts.notHelpful) && counts.notHelpful > 0 ? counts.notHelpful : 0,
  }
}

function canViewNews(profile) {
  return hasActiveProfile(profile) && (profile?.role === 'superadmin' || ['view', 'edit'].includes(profile?.permissions?.news))
}

async function researchWithOpenAi() {
  const apiKey = openAiApiKey.value()
  if (!apiKey) throw new Error('OPENAI_API_KEY ist nicht verfügbar.')
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-5.4',
      input: researchPrompt(),
      reasoning: { effort: 'low' },
      tools: [{ type: 'web_search', search_context_size: 'medium' }],
      tool_choice: 'required',
      text: { format: { type: 'json_schema', name: 'bpl_news_items', strict: true, schema: newsSchema } },
      include: ['web_search_call.action.sources'],
    }),
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(`OpenAI-Anfrage fehlgeschlagen (${response.status}): ${message.slice(0, 500)}`)
  }

  return parseCandidates(await response.json())
}

function isOpenForRecheck(data) {
  if (data.sourceType !== 'external' || !['active', 'openEnded'].includes(data.status || 'active')) return false
  return !validDate(data.validUntil) || data.validUntil >= dateToday()
}

function timestampMillis(value) {
  return typeof value?.toMillis === 'function' ? value.toMillis() : 0
}

function reviewPrompt(items) {
  return [
    'Prüfe die folgenden aktiven Logistikmeldungen mit Websuche erneut. Nutze nur verlässliche Primärquellen, Behörden oder Infrastrukturbetreiber.',
    'Gib nur outcome "update" zurück, wenn eine Quelle eine konkrete Änderung von Status, Beginn oder Ende belegt (Verlängerung, Aufhebung, neues Datum oder relevante operative Änderung). Keine Vermutungen und keine neuen Meldungen.',
    'Für outcome "update" sind eine eigene direkte sourceUrl, source, status und eine kurze deutsche summary mit konkreter Änderung Pflicht. summary maximal 220 Zeichen; niemals nur eine erneute Prüfung protokollieren. validFrom und validUntil nur als YYYY-MM-DD ausgeben, wenn die Quelle sie klar bestätigt; sonst leer lassen. Unklare Zeitangaben nie in ein Datum umwandeln. Für "unchanged" alle übrigen Felder leer lassen.',
    `Zu prüfen: ${JSON.stringify(items)}`,
  ].join('\n')
}

function normalizeReview(value) {
  if (value?.outcome !== 'update' || !NEWS_STATUSES.has(value.status)) return null
  const sourceUrl = cleanUrl(value.sourceUrl)
  const source = cleanText(value.source, 120)
  const summary = cleanText(value.summary, 220)
  if (!sourceUrl || !source || !summary) return null
  const validFrom = validDate(value.validFrom) ? value.validFrom : null
  const validUntil = validDate(value.validUntil) ? value.validUntil : null
  const nextStatus = value.status
  return { status: nextStatus, validFrom, validUntil, summary, source, sourceUrl }
}

async function recheckActiveNews() {
  const snapshot = await database().collection('newsItems').get()
  const candidates = snapshot.docs
    .filter((document) => isOpenForRecheck(document.data()))
    .sort((left, right) => timestampMillis(left.data().lastCheckedAt) - timestampMillis(right.data().lastCheckedAt) || timestampMillis(left.data().createdAt) - timestampMillis(right.data().createdAt))
    .slice(0, MAX_RECHECKS_PER_RUN)
  if (!candidates.length) return { checked: 0, updated: 0 }

  const apiKey = openAiApiKey.value()
  if (!apiKey) throw new Error('OPENAI_API_KEY ist nicht verfügbar.')
  const reviewInput = candidates.map((document) => {
    const data = document.data()
    return { id: document.id, title: data.title, summary: data.summary || data.aiSummary || '', category: data.category, status: data.status || 'active', validFrom: data.validFrom || '', validUntil: data.validUntil || '', source: data.source || '', sourceUrl: data.sourceUrl || '' }
  })
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-5.4', input: reviewPrompt(reviewInput), reasoning: { effort: 'low' }, tools: [{ type: 'web_search', search_context_size: 'medium' }], tool_choice: 'required', text: { format: { type: 'json_schema', name: 'bpl_news_reviews', strict: true, schema: newsReviewSchema } }, include: ['web_search_call.action.sources'] }),
  })
  if (!response.ok) throw new Error(`News-Nachprüfung fehlgeschlagen (${response.status}): ${(await response.text()).slice(0, 500)}`)
  const reviews = new Map(parseCandidates(await response.json()).map((review) => [review.id, review]))
  let updated = 0
  for (const document of candidates) {
    const current = document.data()
    const review = normalizeReview(reviews.get(document.id))
    const update = { lastCheckedAt: FieldValue.serverTimestamp() }
    if (review) {
      update.status = review.status
      if (review.validFrom) update.validFrom = review.validFrom
      if (review.validUntil) update.validUntil = review.validUntil
      if (review.status === 'openEnded') update.validUntil = null
      update.updatedAt = FieldValue.serverTimestamp()
      await document.ref.update(update)
      await document.ref.collection('updates').doc().set({ changedAt: FieldValue.serverTimestamp(), summary: review.summary, source: review.source, sourceUrl: review.sourceUrl, status: review.status, validFrom: update.validFrom || current.validFrom || null, validUntil: update.validUntil === undefined ? current.validUntil || null : update.validUntil })
      updated += 1
    } else {
      await document.ref.update(update)
    }
  }
  return { checked: candidates.length, updated }
}

function normalizeCandidate(candidate) {
  const sourceUrl = cleanUrl(candidate?.sourceUrl)
  const title = cleanText(candidate?.title, 110)
  const summary = cleanText(candidate?.summary, 260)
  const content = cleanText(candidate?.content, 900)
  const source = cleanText(candidate?.source, 120) || (sourceUrl ? new URL(sourceUrl).hostname.replace(/^www\./, '') : '')
  const category = CATEGORIES.has(candidate?.category) ? candidate.category : ''
  const priority = PRIORITIES.has(candidate?.priority) ? candidate.priority : 'information'
  const publishedAt = validDate(candidate?.publishedAt) ? candidate.publishedAt : dateToday()
  const validFrom = validDate(candidate?.validFrom) ? candidate.validFrom : null
  const validUntil = validDate(candidate?.validUntil) ? candidate.validUntil : null
  const status = NEWS_STATUSES.has(candidate?.status) ? candidate.status : 'active'
  const relevance = Number.isInteger(candidate?.relevance) ? Math.max(1, Math.min(100, candidate.relevance)) : null
  const affectedCountries = normalizeSelections(candidate?.affectedCountries, COUNTRIES, 8)
  const topicTags = normalizeSelections(candidate?.topicTags, TAGS_BY_CATEGORY[category] || new Set(), 3)
  const affects = normalizeSelections(candidate?.affects, AFFECTS, 5)

  if (!sourceUrl || !title || !summary || !content || !category || !source || relevance === null || !topicTags.length) return null
  return { title, summary, content, category, priority, source, sourceUrl, publishedAt, validFrom, validUntil, status, relevance, affectedCountries, topicTags, affects }
}

function normalizeSelections(values, allowedValues, maximum) {
  if (!Array.isArray(values)) return []
  const selections = []
  const seen = new Set()
  for (const value of values) {
    if (typeof value !== 'string' || !allowedValues.has(value) || seen.has(value)) continue
    seen.add(value)
    selections.push(value)
    if (selections.length === maximum) break
  }
  return selections
}

async function migrateLegacyNewsCategories() {
  let migrated = 0

  for (const [legacyCategory, category] of Object.entries(LEGACY_CATEGORY_MAPPINGS)) {
    const legacyItems = await database().collection('newsItems').where('category', '==', legacyCategory).get()
    if (legacyItems.empty) continue

    const documents = legacyItems.docs
    for (let start = 0; start < documents.length; start += 500) {
      const batch = database().batch()
      for (const document of documents.slice(start, start + 500)) {
        batch.update(document.ref, { category, updatedAt: FieldValue.serverTimestamp() })
      }
      await batch.commit()
      migrated += Math.min(500, documents.length - start)
    }
  }

  return migrated
}

async function saveNewItems(candidates) {
  let created = 0
  let skipped = 0
  const seenUrls = new Set()

  for (const candidate of candidates.slice(0, MAX_ITEMS_PER_RUN)) {
    const item = normalizeCandidate(candidate)
    if (!item || seenUrls.has(item.sourceUrl)) {
      skipped += 1
      continue
    }
    seenUrls.add(item.sourceUrl)

    const existing = await database().collection('newsItems').where('sourceUrl', '==', item.sourceUrl).limit(1).get()
    if (!existing.empty) {
      skipped += 1
      continue
    }

    const reference = database().collection('newsItems').doc()
    await reference.set({
      id: reference.id,
      ...item,
      sourceType: 'external',
      reactionsAllowed: true,
      status: item.status,
      lastCheckedAt: FieldValue.serverTimestamp(),
      aiSummary: item.summary,
      fetchedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    created += 1
  }

  return { created, skipped }
}

async function executeNewsResearch() {
  const migrated = await migrateLegacyNewsCategories()
  const candidates = await researchWithOpenAi()
  const result = await saveNewItems(candidates)
  const recheck = await recheckActiveNews()
  logger.info('Automatische News-Recherche abgeschlossen.', { candidates: candidates.length, migrated, ...result, ...recheck })
  return { candidates: candidates.length, migrated, ...result, ...recheck }
}

function formatFailureTime() {
  return new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' }).format(new Date())
}

async function notifySuperadminsAboutResearchFailure(error) {
  const notificationUrl = powerAutomateNotificationUrl.value()
  if (!notificationUrl) {
    logger.error('Keine E-Mail-Benachrichtigung zur News-Recherche möglich: POWER_AUTOMATE_NOTIFICATION_URL fehlt.')
    return
  }

  const recipients = [...new Set((await database().collection('users').where('role', '==', 'superadmin').get()).docs
    .map((document) => document.data())
    .filter((profile) => profile.active !== false)
    .map((profile) => typeof profile.email === 'string' ? profile.email.trim().toLowerCase() : '')
    .filter((email) => /^\S+@\S+\.\S+$/.test(email)))]
  if (!recipients.length) {
    logger.error('Keine aktiven Superadmins mit gültiger E-Mail-Adresse für die News-Recherche-Benachrichtigung gefunden.')
    return
  }

  const reason = cleanText(error instanceof Error ? error.message : String(error), 900) || 'Unbekannter Fehler'
  const subject = 'Drehpunkt: Automatische News-Recherche fehlgeschlagen'
  const message = `Zeitpunkt: ${formatFailureTime()} Uhr\n\nFehlerursache: ${reason}\n\nBitte die News-Recherche und die Konfiguration prüfen.`
  const results = await Promise.allSettled(recipients.map(async (to) => {
    const response = await fetch(notificationUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, message, type: 'news_research_failure' }),
    })
    if (!response.ok) throw new Error(`Benachrichtigungsdienst antwortete mit ${response.status}.`)
  }))
  const failed = results.filter((result) => result.status === 'rejected').length
  if (failed) logger.error('Nicht alle Superadmins konnten über die fehlgeschlagene News-Recherche benachrichtigt werden.', { recipients: recipients.length, failed })
}

export const scheduledNewsResearch = onSchedule({
  schedule: '0 7 * * *',
  timeZone: 'Europe/Berlin',
  region: 'europe-west3',
  memory: '512MiB',
  timeoutSeconds: 540,
  secrets: [openAiApiKey, powerAutomateNotificationUrl],
}, async () => {
  try {
    await executeNewsResearch()
  } catch (error) {
    logger.error('Automatische News-Recherche fehlgeschlagen.', error)
    await notifySuperadminsAboutResearchFailure(error)
    throw error
  }
})

export const runAutomatedNewsResearch = onCall({
  region: 'europe-west3',
  timeoutSeconds: 540,
  secrets: [openAiApiKey],
}, async (request) => {
  requireRole(await requireActiveProfile(request), ['superadmin'], 'Nur Superadmins dürfen die Recherche manuell starten.')
  return executeNewsResearch()
})

export const setNewsReaction = onCall({ region: 'europe-west3' }, async (request) => {
  const profile = await requireActiveProfile(request)
  const itemId = request.data?.itemId
  const requestedReaction = request.data?.reaction
  if (typeof itemId !== 'string' || !itemId || itemId.includes('/')) throw new HttpsError('invalid-argument', 'Ungültige News-ID.')
  if (requestedReaction !== null && !NEWS_REACTIONS.has(requestedReaction)) throw new HttpsError('invalid-argument', 'Ungültige Reaktion.')

  if (!canViewNews(profile)) throw new HttpsError('permission-denied', 'Keine Berechtigung für News-Reaktionen.')

  const itemRef = database().doc(`newsItems/${itemId}`)
  const stateRef = database().doc(`newsItemReadStates/${request.auth.uid}/items/${itemId}`)
  let result
  await database().runTransaction(async (transaction) => {
    const itemSnapshot = await transaction.get(itemRef)
    const stateSnapshot = await transaction.get(stateRef)
    if (!itemSnapshot.exists || itemSnapshot.data().status === 'archived') throw new HttpsError('not-found', 'Diese News ist nicht verfügbar.')
    if (!reactionsAllowed(itemSnapshot.data())) throw new HttpsError('failed-precondition', 'Für diese News sind keine Reaktionen erlaubt.')

    const previousReaction = NEWS_REACTIONS.has(stateSnapshot.data()?.reaction) ? stateSnapshot.data().reaction : null
    if (previousReaction === requestedReaction) {
      result = { reaction: previousReaction, counts: reactionCounts(itemSnapshot.data()) }
      return
    }

    const counts = reactionCounts(itemSnapshot.data())
    if (previousReaction) counts[previousReaction] = Math.max(0, counts[previousReaction] - 1)
    if (requestedReaction) counts[requestedReaction] += 1
    transaction.update(itemRef, { reactionCounts: counts })
    if (requestedReaction) transaction.set(stateRef, { itemId, reaction: requestedReaction, reactionUpdatedAt: FieldValue.serverTimestamp() }, { merge: true })
    else if (stateSnapshot.exists) transaction.set(stateRef, { reaction: FieldValue.delete(), reactionUpdatedAt: FieldValue.delete() }, { merge: true })
    result = { reaction: requestedReaction, counts }
  })
  return result
})
