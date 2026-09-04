import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { defineSecret } from 'firebase-functions/params'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { logger } from 'firebase-functions'

function database() { return getFirestore() }
const openAiApiKey = defineSecret('OPENAI_API_KEY')

const CATEGORIES = new Set(['highway', 'law', 'logistics', 'other'])
const PRIORITIES = new Set(['information', 'notice', 'important'])
const MAX_ITEMS_PER_RUN = 6

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
    'Prüfe besonders: Maut, Fahrverbote, große Autobahn- und Grenzbeeinträchtigungen, EU-/nationale Transport- und Arbeitsrechtsregeln, Zoll, Gefahrgut, Branchenentwicklungen sowie bedeutende Cyber- oder IT-Warnungen für Logistikunternehmen.',
    'Nimm nur belegte Meldungen der letzten sieben Tage oder verbindliche, bereits veröffentlichte Ankündigungen mit einem klaren künftigen Stichtag auf.',
    'Ignoriere allgemeine Marktkommentare, kleine lokale Störungen, PR-Meldungen ohne konkrete Auswirkung und bereits länger bekannte Inhalte.',
    'Arbeite nur mit verlässlichen Primärquellen oder anerkannten Fachquellen. Jede Meldung braucht eine direkte Quell-URL und darf ohne Quelle nicht ausgegeben werden.',
    'Ordne exakt einer Kategorie zu: highway (Autobahn, Verkehr, Maut, Fahrverbote), law (Gesetze, Zoll, Compliance), logistics (Branche, operative Logistik) oder other (IT/Sicherheit und sonstige relevante Themen).',
    'Bewerte priority als information, notice oder important. important nur bei unmittelbarem Handlungsbedarf, Frist oder deutlicher Kosten-/Betriebswirkung.',
    'Formuliere auf Deutsch, nüchtern und ohne Spekulation. summary: höchstens 420 Zeichen. content: höchstens 900 Zeichen und konkret mit „Bedeutung für BPL“ sowie, falls sinnvoll, „Nächster Schritt“.',
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
      maxItems: MAX_ITEMS_PER_RUN,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'summary', 'content', 'category', 'priority', 'source', 'sourceUrl', 'publishedAt', 'relevance'],
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
          content: { type: 'string' },
          category: { type: 'string', enum: ['highway', 'law', 'logistics', 'other'] },
          priority: { type: 'string', enum: ['information', 'notice', 'important'] },
          source: { type: 'string' },
          sourceUrl: { type: 'string' },
          publishedAt: { type: 'string' },
          relevance: { type: 'integer', minimum: 1, maximum: 100 },
        },
      },
    },
  },
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

function normalizeCandidate(candidate) {
  const sourceUrl = cleanUrl(candidate?.sourceUrl)
  const title = cleanText(candidate?.title, 160)
  const summary = cleanText(candidate?.summary, 420)
  const content = cleanText(candidate?.content, 900)
  const source = cleanText(candidate?.source, 120) || (sourceUrl ? new URL(sourceUrl).hostname.replace(/^www\./, '') : '')
  const category = CATEGORIES.has(candidate?.category) ? candidate.category : 'other'
  const priority = PRIORITIES.has(candidate?.priority) ? candidate.priority : 'information'
  const publishedAt = validDate(candidate?.publishedAt) ? candidate.publishedAt : dateToday()
  const relevance = Number.isInteger(candidate?.relevance) ? Math.max(1, Math.min(100, candidate.relevance)) : null

  if (!sourceUrl || !title || !summary || !content || !source || relevance === null) return null
  return { title, summary, content, category, priority, source, sourceUrl, publishedAt, relevance }
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
      status: 'active',
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
  const candidates = await researchWithOpenAi()
  const result = await saveNewItems(candidates)
  logger.info('Automatische News-Recherche abgeschlossen.', { candidates: candidates.length, ...result })
  return { candidates: candidates.length, ...result }
}

export const scheduledNewsResearch = onSchedule({
  schedule: '0 7 * * *',
  timeZone: 'Europe/Berlin',
  region: 'europe-west3',
  memory: '512MiB',
  timeoutSeconds: 540,
  secrets: [openAiApiKey],
}, async () => {
  await executeNewsResearch()
})

export const runAutomatedNewsResearch = onCall({
  region: 'europe-west3',
  timeoutSeconds: 540,
  secrets: [openAiApiKey],
}, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Anmeldung erforderlich.')
  const profile = (await database().doc(`users/${request.auth.uid}`).get()).data()
  if (profile?.role !== 'superadmin') throw new HttpsError('permission-denied', 'Nur Superadmins dürfen die Recherche manuell starten.')
  return executeNewsResearch()
})
