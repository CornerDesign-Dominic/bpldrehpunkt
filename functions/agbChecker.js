import { Buffer } from 'node:buffer'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { defineSecret } from 'firebase-functions/params'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'

const openAiApiKey = defineSecret('DREHPUNKT_AGB_CHECKER_KEY')
const model = 'gpt-5.4'
const maxPdfBytes = 20 * 1024 * 1024
const maxTextCharacters = 160_000
const usageCollection = 'agbCheckerUsage'

const resultFields = [
  ['customer', 'Firmenname / Adresse'], ['customer', 'USt-IdNr.'],
  ['billing', 'Gutschriftsverfahren'], ['billing', 'Zahlungsziel'], ['billing', 'Rechnungs-E-Mail-Adresse'], ['billing', 'Originalrechnung / Originalbelege per Post'], ['billing', 'Besondere Abrechnungsanforderungen'],
  ['pallets', 'Preis / Vergütung / Belastung für Europaletten'], ['pallets', 'Preis / Vergütung / Belastung für Düsseldorfer Paletten'], ['pallets', 'Preis / Vergütung / Belastung für Gitterboxen'],
  ['costs', 'Vertragsstrafen'], ['costs', 'Abzüge'], ['costs', 'Gebühren'], ['costs', 'Standgeldvergütung / Standgeldregelung'],
  ['prohibitions', 'Subunternehmerverbot'], ['prohibitions', 'Umladeverbot'],
]

const fieldNames = resultFields.map(([, field]) => field)
const resultSchema = {
  type: 'object', additionalProperties: false, required: ['results', 'contactsStatus', 'contacts', 'findings'],
  properties: {
    results: {
      type: 'array', maxItems: resultFields.length,
      items: {
        type: 'object', additionalProperties: false, required: ['field', 'status', 'value', 'sourceText', 'confidence'],
        properties: {
          field: { type: 'string', enum: fieldNames },
          status: { type: 'string', enum: ['found', 'not_found', 'unclear'] },
          value: { type: 'string' }, sourceText: { type: 'string' }, confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
    contactsStatus: { type: 'string', enum: ['found', 'not_found', 'unclear'] },
    contacts: {
      type: 'array', maxItems: 50,
      items: {
        type: 'object', additionalProperties: false, required: ['name', 'department', 'email', 'status', 'sourceText', 'confidence'],
        properties: {
          name: { type: 'string' }, department: { type: 'string' }, email: { type: 'string' },
          status: { type: 'string', enum: ['found', 'unclear'] }, sourceText: { type: 'string' }, confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
    findings: { type: 'array', maxItems: 5, items: { type: 'string' } },
  },
}

function errorWithType(message, errorType) { const error = new Error(message); error.errorType = errorType; return error }
function cleanText(value, maxLength) { return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength) : '' }
function responseText(response) { return typeof response.output_text === 'string' ? response.output_text : (response.output || []).flatMap((output) => output.content || []).filter((content) => content.type === 'output_text' && typeof content.text === 'string').map((content) => content.text).join('\n') }
function hasAgbCheckerAccess(profile) { return profile?.role === 'superadmin' || ['view', 'edit'].includes(profile?.permissions?.agbChecker) }

function decodePdf(base64Pdf) {
  if (typeof base64Pdf !== 'string' || !base64Pdf || base64Pdf.length > Math.ceil(maxPdfBytes * 4 / 3) + 1024) throw errorWithType('Die PDF-Datei ist ungültig oder zu groß.', 'invalid_pdf_input')
  const bytes = Buffer.from(base64Pdf, 'base64')
  if (!bytes.length || bytes.length > maxPdfBytes || bytes.subarray(0, 4).toString('ascii') !== '%PDF') throw errorWithType('Die PDF-Datei ist ungültig oder zu groß.', 'invalid_pdf_input')
  return new Uint8Array(bytes)
}

function fileName(value) {
  const clean = cleanText(value, 180).replace(/[\\/]/g, '')
  return clean || 'Kundenauftrag.pdf'
}

async function extractPdfText(pdfBytes) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const loadingTask = getDocument({ data: pdfBytes, disableWorker: true, enableScripting: false, verbosity: 0 })
  try {
    const pdf = await loadingTask.promise
    let text = ''
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const textContent = await page.getTextContent()
      const pageText = textContent.items.map((item) => item.str || '').join(' ').replace(/\s+/g, ' ').trim()
      if (pageText) text += `${text ? '\n\n' : ''}[Seite ${pageNumber}]\n${pageText}`
      if (text.length > maxTextCharacters) throw errorWithType('Der auslesbare Dokumenttext ist für diese Prüfung zu umfangreich.', 'document_too_large')
    }
    if (!text.trim()) throw errorWithType('Aus der PDF konnte kein auswertbarer Text gelesen werden.', 'empty_pdf_text')
    return { text, pageCount: pdf.numPages }
  } finally {
    loadingTask.destroy()
  }
}

function prompt(documentText) {
  return [
    'Du prüfst ausschließlich dauerhafte kaufmännische und vertragliche Bedingungen eines Kunden. Du gibst keine juristische Bewertung ab.',
    'Ignoriere ausdrücklich alle konkreten operativen Transportdaten: Ladestellen, Entladestellen, Lade- und Entladezeiten, Fixtermine, Auftrags- und Referenznummern, Fahrzeug- und Fahrerdaten, Kennzeichen, konkreten Frachtpreis, Gewichte, Mengen, Packstücke, Transportstrecken und sonstige Sendungsdaten. Diese Informationen dürfen weder in results noch contacts noch findings erscheinen.',
    'Prüfe ausschließlich den übergebenen Dokumenttext. Erfinde keine Werte und nutze keine Branchenannahmen. Wenn eine Angabe nicht eindeutig belegt ist, verwende status "not_found" oder "unclear". Bei "not_found" sind value und sourceText leer. Bei "found" oder "unclear" liefere nur einen kurzen, relevanten Originalausschnitt als sourceText.',
    'Prüfe jeden vorgegebenen Prüfpunkt höchstens einmal. Beim Gutschriftsverfahren verwende bei eindeutiger Aussage "Ja" oder "Nein". Bei Originalrechnung / Originalbelegen per Post verwende bei eindeutiger Aussage "Erforderlich" oder "Nicht erforderlich". Bei Subunternehmerverbot und Umladeverbot verwende bei eindeutiger Aussage "Ja" oder "Nein". Bei Palettenpreisen übernimm Betrag, Einheit und Kontext. Mehrere Preisfälle für Verlust, Nichttausch oder Rückgabe müssen verständlich getrennt dargestellt werden. Gib bei Standgeld die relevante Regelung kompakt einschließlich Betrag, Einheit und möglicher Freistunden wieder.',
    'contacts ist eine Liste aller im Dokument gefundenen Ansprechpartner. Jeder Eintrag enthält Name, Abteilung oder Funktion, E-Mail-Adresse, status, confidence und einen kurzen sourceText. Wenn nur eine E-Mail-Adresse gefunden wird, nimm sie mit leerem Namen auf. Erfinde keine Abteilung. Bei keinen Ansprechpartnern ist contacts leer und contactsStatus "not_found".',
    'findings enthält höchstens fünf tatsächlich dokumentierte Auffälligkeiten. Nimm dort ausschließlich Informationen auf, die zusätzliche Kosten, Vertragsstrafen, Abzüge, Gebühren oder sonstige finanzielle Nachteile verursachen, ungewöhnlich strenge Fristen mit möglicher Sanktion enthalten, ein Verbot oder eine wesentliche Einschränkung darstellen oder deren Nichtbeachtung wahrscheinlich zu Kosten, Sanktionen oder operativen Problemen führt.',
    'Normale organisatorische Angaben sind keine Auffälligkeiten. Dazu zählen insbesondere Rechnungs-E-Mail-Adressen, Ansprechpartner, reine Versand- oder Übermittlungswege, Portaladressen oder Portaleinreichung ohne Sanktion, normale Zahlungsziele, normale Dokumentationsanforderungen, reine Fristen ohne erkennbaren Nachteil oder Sanktion sowie normale Angaben zu Rechnungsversand oder Belegen. Solche Angaben gehören nur in den jeweils passenden Fachbereich und dürfen nicht zusätzlich in findings erscheinen.',
    'Eine Frist oder Dokumentationspflicht gehört nur dann in findings, wenn der Dokumenttext auch den relevanten Nachteil, die Sanktion, Kosten oder das operative Problem belegt. Fasse zusammenhängende Bedingungen in genau einer kompakten Auffälligkeit zusammen: Bei einem Abzug wegen verspäteter Ablieferbelege nenne Betrag, Bedingung und Frist in einem Eintrag, ohne die Frist zusätzlich als eigene Auffälligkeit zu wiederholen. Keine Rechtsberatung, keine Aussagen zur Wirksamkeit oder Rechtmäßigkeit einer Klausel.',
    `Dokumenttext:\n${documentText}`,
  ].join('\n\n')
}

async function callOpenAi(documentText) {
  const apiKey = openAiApiKey.value()
  if (!apiKey) throw errorWithType('Der OpenAI-Key für den AGB-Prüfer ist nicht konfiguriert.', 'configuration_error')
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: prompt(documentText), reasoning: { effort: 'low' }, text: { format: { type: 'json_schema', name: 'agb_checker_result', strict: true, schema: resultSchema } } }),
  })
  if (!response.ok) {
    const error = errorWithType(`OpenAI-Anfrage fehlgeschlagen (${response.status}).`, response.status === 429 ? 'rate_limited' : response.status >= 500 ? 'provider_server_error' : 'provider_request_error')
    error.status = response.status; error.requestId = response.headers.get('x-request-id') || ''
    throw error
  }
  const payload = await response.json()
  try {
    return { result: JSON.parse(responseText(payload)), usage: payload.usage, requestId: response.headers.get('x-request-id') || payload._request_id || '' }
  } catch {
    const error = errorWithType('OpenAI hat kein gültiges Ergebnis zurückgegeben.', 'invalid_model_response')
    error.usage = payload.usage; error.requestId = response.headers.get('x-request-id') || payload._request_id || ''
    throw error
  }
}

function tokenCount(value) { return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0 }
function tokenUsage(usage = {}) { const inputTokens = tokenCount(usage.input_tokens); const outputTokens = tokenCount(usage.output_tokens); return { inputTokens, outputTokens, totalTokens: tokenCount(usage.total_tokens) || inputTokens + outputTokens } }

function validateModelResult(result) {
  if (!result || !Array.isArray(result.results) || !Array.isArray(result.contacts) || !Array.isArray(result.findings) || !['found', 'not_found', 'unclear'].includes(result.contactsStatus)) throw errorWithType('OpenAI hat kein strukturiertes Ergebnis zurückgegeben.', 'invalid_model_response')
  const seen = new Set()
  for (const item of result.results) {
    if (!item || !fieldNames.includes(item.field) || seen.has(item.field) || !['found', 'not_found', 'unclear'].includes(item.status) || typeof item.value !== 'string' || typeof item.sourceText !== 'string' || !['high', 'medium', 'low'].includes(item.confidence)) throw errorWithType('OpenAI hat ein ungültiges Prüfergebnis zurückgegeben.', 'invalid_model_response')
    seen.add(item.field)
  }
  if (result.contacts.some((contact) => !contact || typeof contact.name !== 'string' || typeof contact.department !== 'string' || typeof contact.email !== 'string' || !['found', 'unclear'].includes(contact.status) || typeof contact.sourceText !== 'string' || !['high', 'medium', 'low'].includes(contact.confidence) || (!contact.name.trim() && !contact.email.trim()))) throw errorWithType('OpenAI hat ungültige Ansprechpartner zurückgegeben.', 'invalid_model_response')
  if (result.contactsStatus === 'not_found' && result.contacts.length) throw errorWithType('OpenAI hat widersprüchliche Ansprechpartner zurückgegeben.', 'invalid_model_response')
  if (result.findings.some((item) => typeof item !== 'string')) throw errorWithType('OpenAI hat ungültige Auffälligkeiten zurückgegeben.', 'invalid_model_response')
}

function normalizeResult(result) {
  const received = new Map((Array.isArray(result?.results) ? result.results : []).filter((item) => fieldNames.includes(item?.field)).map((item) => [item.field, item]))
  const results = resultFields.map(([category, field]) => {
    const item = received.get(field)
    const status = ['found', 'not_found', 'unclear'].includes(item?.status) ? item.status : 'not_found'
    return {
      category, field, status,
      value: status === 'not_found' ? '' : cleanText(item?.value, 500),
      sourceText: status === 'not_found' ? '' : cleanText(item?.sourceText, 900),
      confidence: ['high', 'medium', 'low'].includes(item?.confidence) ? item.confidence : 'low',
    }
  })
  const contacts = (result.contactsStatus === 'not_found' ? [] : result.contacts)
    .map((contact) => ({ name: cleanText(contact.name, 180), department: cleanText(contact.department, 180), email: cleanText(contact.email, 320), status: contact.status, sourceText: cleanText(contact.sourceText, 900), confidence: contact.confidence }))
    .filter((contact) => contact.name || contact.email)
    .filter((contact, index, all) => all.findIndex((candidate) => `${candidate.name}|${candidate.department}|${candidate.email}` === `${contact.name}|${contact.department}|${contact.email}`) === index)
  const contactsStatus = result.contactsStatus === 'found' && !contacts.length ? 'unclear' : result.contactsStatus
  return { results, contactsStatus, contacts, findings: (Array.isArray(result?.findings) ? result.findings : []).map((item) => cleanText(item, 360)).filter(Boolean).slice(0, 5) }
}

async function logUsage({ userId, analyzedFileName, usage, success, errorType, pageCount, requestId, durationMs }) {
  const tokens = tokenUsage(usage)
  await getFirestore().collection(usageCollection).add({
    timestamp: FieldValue.serverTimestamp(), userId, fileName: analyzedFileName, model,
    ...tokens, success: success === true, errorType: success ? null : errorType || 'internal_error',
    pageCount: Number.isInteger(pageCount) && pageCount > 0 ? pageCount : null,
    durationMs: Number.isFinite(durationMs) && durationMs >= 0 ? Math.round(durationMs) : 0,
    requestId: typeof requestId === 'string' && requestId ? requestId.slice(0, 200) : null,
  })
}

export const analyzeCustomerOrderTerms = onCall({ region: 'europe-west3', memory: '1GiB', timeoutSeconds: 120, secrets: [openAiApiKey] }, async (request) => {
  try {
    const profile = await requireActiveProfile(request)
    if (!hasAgbCheckerAccess(profile)) throw new HttpsError('permission-denied', 'Keine Berechtigung für den AGB-Prüfer.')
  } catch (error) {
    if (error instanceof HttpsError || ['unauthenticated', 'permission-denied'].includes(error?.code)) throw error
    logger.error('AGB-Prüfer-Zugriffsprüfung fehlgeschlagen.', { errorType: error?.errorType || 'profile_access_failed' })
    throw new HttpsError('unavailable', 'Der AGB-Prüfer ist aktuell nicht erreichbar. Bitte versuche es später erneut.')
  }
  const startedAt = Date.now()
  const analyzedFileName = fileName(request.data?.fileName)
  let usage; let pageCount; let requestId
  try {
    const pdfBytes = decodePdf(request.data?.pdfBase64)
    const extraction = await extractPdfText(pdfBytes)
    pageCount = extraction.pageCount
    const ai = await callOpenAi(extraction.text)
    usage = ai.usage; requestId = ai.requestId
    validateModelResult(ai.result)
    const data = normalizeResult(ai.result)
    try { await logUsage({ userId: request.auth.uid, analyzedFileName, usage, success: true, pageCount, requestId, durationMs: Date.now() - startedAt }) } catch (loggingError) { logger.error('AGB-Prüfer-Nutzung konnte nicht protokolliert werden.', { errorType: loggingError?.errorType || 'internal_error' }) }
    return data
  } catch (error) {
    try { await logUsage({ userId: request.auth.uid, analyzedFileName, usage: error?.usage || usage, success: false, errorType: error?.errorType, pageCount: error?.pageCount || pageCount, requestId: error?.requestId || requestId, durationMs: Date.now() - startedAt }) } catch (loggingError) { logger.error('AGB-Prüfer-Nutzung konnte nicht protokolliert werden.', { errorType: loggingError?.errorType || 'internal_error' }) }
    if (['invalid_pdf_input', 'document_too_large', 'empty_pdf_text'].includes(error?.errorType)) throw new HttpsError('invalid-argument', error.message)
    if (error?.errorType === 'configuration_error') throw new HttpsError('failed-precondition', 'Der AGB-Prüfer ist noch nicht konfiguriert.')
    logger.warn('AGB-Prüfung fehlgeschlagen.', { errorType: error?.errorType || 'internal_error', requestId: error?.requestId || requestId || '' })
    throw new HttpsError('unavailable', 'Der Kundenauftrag konnte aktuell nicht geprüft werden. Bitte versuche es später erneut.')
  }
})
