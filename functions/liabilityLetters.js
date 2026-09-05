import { logger } from 'firebase-functions'
import { Buffer } from 'node:buffer'
import { defineSecret } from 'firebase-functions/params'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { requireActiveProfile } from './access.js'
import { executeAiOperation } from './aiUsage.js'
import { extractTransportOrderFromPdf } from './transportOrderExtraction.js'

const openAiApiKey = defineSecret('OPENAI_API_KEY_HAFTBARHALTUNG')
const feature = 'haftbarhaltung'
const model = 'gpt-5.4'
const maxPdfBytes = 20 * 1024 * 1024

const addressSchema = {
  type: 'object', additionalProperties: false, required: ['company', 'street', 'postalCode', 'city', 'country'],
  properties: { company: { type: 'string' }, street: { type: 'string' }, postalCode: { type: 'string' }, city: { type: 'string' }, country: { type: 'string' } },
}
const analysisSchema = {
  type: 'object', additionalProperties: false, required: ['carrier', 'loadingPlace', 'unloadingPlace', 'incidentText'],
  properties: { carrier: addressSchema, loadingPlace: addressSchema, unloadingPlace: addressSchema, incidentText: { type: 'string' } },
}

function cleanText(value, maxLength) { return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength) : '' }
function hasTemplateAccess(profile) { return profile?.role === 'superadmin' || ['view', 'edit'].includes(profile?.permissions?.templates) }
function responseText(response) { return typeof response.output_text === 'string' ? response.output_text : (response.output || []).flatMap((output) => output.content || []).filter((content) => content.type === 'output_text' && typeof content.text === 'string').map((content) => content.text).join('\n') }
function errorWithType(message, errorType) { const error = new Error(message); error.errorType = errorType; return error }

function decodePdf(base64Pdf) {
  if (typeof base64Pdf !== 'string' || !base64Pdf || base64Pdf.length > Math.ceil(maxPdfBytes * 4 / 3) + 1024) throw errorWithType('PDF-Eingabe ist ungültig.', 'invalid_pdf_input')
  const bytes = Buffer.from(base64Pdf, 'base64')
  if (!bytes.length || bytes.length > maxPdfBytes || bytes.subarray(0, 4).toString('ascii') !== '%PDF') throw errorWithType('PDF-Eingabe ist ungültig.', 'invalid_pdf_input')
  return new Uint8Array(bytes)
}

function cleanAddress(value) {
  return {
    company: cleanText(value?.company, 180), street: cleanText(value?.street, 180), postalCode: /^\d{4,6}$/.test(cleanText(value?.postalCode, 12)) ? cleanText(value.postalCode, 12) : '', city: cleanText(value?.city, 120), country: cleanText(value?.country, 80),
  }
}
function mergeAddress(deterministic, aiAddress) { const ai = cleanAddress(aiAddress); return Object.fromEntries(Object.keys(ai).map((field) => [field, ai[field] || deterministic[field] || ''])) }

function liabilityPrompt({ rawAddressBlocks, incidentSummary }) {
  return [
    'Du bereitest ausschließlich eine Haftbarhaltung für einen BPL-Transportauftrag vor.',
    'Zerlege die drei übergebenen Adressblöcke in Firma/Name, Straße, PLZ, Ort und Land. Übernimm nur eindeutig im Block enthaltene Werte; bei Unsicherheit verwende einen leeren String. Ergänze oder erfinde keine Daten.',
    'Formuliere aus der Nutzerschilderung zwei bis vier professionelle, sachliche Sätze. Übernimm ausschließlich genannte Tatsachen. Erfinde keine Schäden, Kosten, Beträge, Ursachen, Fristen oder rechtlichen Bewertungen. Bei leerer Nutzerschilderung ist incidentText leer.',
    'Die Auswahl der ersten Ladestelle und letzten Entladestelle wurde bereits deterministisch vorgenommen. Ändere diese Zuordnung nicht.',
    `Adressblöcke: ${JSON.stringify(rawAddressBlocks)}`,
    `Nutzerschilderung: ${incidentSummary || ''}`,
  ].join('\n')
}

async function callOpenAi({ rawAddressBlocks, incidentSummary }) {
  const apiKey = openAiApiKey.value()
  if (!apiKey) throw errorWithType('OpenAI-Key für Haftbarhaltung ist nicht konfiguriert.', 'configuration_error')
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: liabilityPrompt({ rawAddressBlocks, incidentSummary }), reasoning: { effort: 'low' }, text: { format: { type: 'json_schema', name: 'bpl_liability_addresses', strict: true, schema: analysisSchema } } }),
  })
  if (!response.ok) {
    const error = errorWithType(`OpenAI-Anfrage fehlgeschlagen (${response.status}).`, response.status === 429 ? 'rate_limited' : response.status >= 500 ? 'provider_server_error' : 'provider_request_error')
    error.status = response.status
    error.requestId = response.headers.get('x-request-id') || ''
    throw error
  }
  const payload = await response.json()
  try {
    return { result: JSON.parse(responseText(payload)), usage: payload.usage, requestId: response.headers.get('x-request-id') || payload._request_id || '' }
  } catch {
    const error = errorWithType('OpenAI hat kein gültiges Ergebnis zurückgegeben.', 'invalid_model_response')
    error.usage = payload.usage
    error.requestId = response.headers.get('x-request-id') || payload._request_id || ''
    throw error
  }
}

export const analyzeLiabilityTransportOrder = onCall({ region: 'europe-west3', memory: '1GiB', timeoutSeconds: 120, secrets: [openAiApiKey] }, async (request) => {
  const profile = await requireActiveProfile(request)
  if (!hasTemplateAccess(profile)) throw new HttpsError('permission-denied', 'Keine Berechtigung für Vorlagen.')
  const pdfBytes = decodePdf(request.data?.pdfBase64)
  const incidentSummary = cleanText(request.data?.incidentSummary, 4000)
  try {
    const result = await executeAiOperation({
      feature, userId: request.auth.uid, model,
      operation: async () => {
        let extraction
        try {
          extraction = await extractTransportOrderFromPdf(pdfBytes)
        } catch (error) {
          error.errorType ||= 'pdf_extraction_failed'
          error.fileSize = pdfBytes.byteLength
          throw error
        }
        const ai = await callOpenAi({ rawAddressBlocks: extraction.rawAddressBlocks, incidentSummary })
        const data = {
          orderNumber: extraction.data.orderNumber,
          carrier: mergeAddress(extraction.data.carrier, ai.result?.carrier),
          loadingPlace: { ...mergeAddress(extraction.data.loadingPlace, ai.result?.loadingPlace), date: extraction.data.loadingPlace.date },
          unloadingPlace: { ...mergeAddress(extraction.data.unloadingPlace, ai.result?.unloadingPlace), date: extraction.data.unloadingPlace.date },
          incidentText: cleanText(ai.result?.incidentText, 1800),
        }
        logger.info('Haftbarhaltung-Auswertung abgeschlossen.', { userId: request.auth.uid, fileSize: pdfBytes.byteLength, pageCount: extraction.pageCount, orderNumberFound: Boolean(data.orderNumber), carrierFound: Boolean(data.carrier.company), loadingFound: Boolean(data.loadingPlace.company), unloadingFound: Boolean(data.unloadingPlace.company) })
        return { data, usage: ai.usage, requestId: ai.requestId, fileSize: pdfBytes.byteLength, pageCount: extraction.pageCount }
      },
    })
    return result.data
  } catch (error) {
    logger.warn('Haftbarhaltung-Auswertung fehlgeschlagen.', { userId: request.auth.uid, errorType: error?.errorType || 'internal_error' })
    throw new HttpsError('unavailable', 'Der Transportauftrag konnte aktuell nicht ausgewertet werden.')
  }
})
