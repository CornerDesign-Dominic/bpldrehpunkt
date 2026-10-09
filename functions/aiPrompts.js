import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { requireActiveProfile, requireRole } from './access.js'

const region = 'europe-west3'
const collection = 'aiPromptConfigs'
const maximumInstructionsLength = 5000

const definitions = {
  haftbarhaltung: {
    displayName: 'Haftbarhaltung',
    description: 'Ergänzende Vorgaben für die sachliche Formulierung und Adressaufbereitung. Feste PDF-Extraktions- und Sicherheitsregeln bleiben geschützt.',
    defaultInstructions: 'Formuliere den individuellen Sachverhalt kurz, neutral und professionell. Bevorzuge allgemeine Aussagen gegenüber konkreten Details.',
  },
  news: {
    displayName: 'News',
    description: 'Ergänzende redaktionelle Vorgaben für die KI-gestützte News-Recherche. Quellen-, Kategorien- und Validierungsregeln bleiben geschützt.',
    defaultInstructions: 'Formuliere News verständlich, konkret und operativ relevant für ein Logistikunternehmen.',
  },
  statusMailTracking: {
    displayName: 'Sendungsverfolgung – Mail-Auswertung',
    description: 'Ergänzende fachliche Vorgaben für die KI-Auswertung eingehender Status-Mails von Unternehmern. Extraktion, Sicherheitsregeln, Datumsprüfung und Datenvalidierung bleiben geschützt.',
    defaultInstructions: 'Bei einer eindeutigen Zeitspanne für eine voraussichtliche Ankunft verwende den späteren Zeitpunkt als ETA. Beispiel: „Der LKW kommt zwischen 10 und 11 Uhr“ bedeutet ETA 11:00 Uhr. Übernimm nur eindeutige Angaben aus der aktuellen Status-Mail.',
  },
}

function cleanInstructions(value) {
  if (typeof value !== 'string') throw new HttpsError('invalid-argument', 'Die Prompt-Anweisung ist ungültig.')
  const cleaned = value.trim()
  if (!cleaned || cleaned.length > maximumInstructionsLength) throw new HttpsError('invalid-argument', `Die Prompt-Anweisung muss zwischen 1 und ${maximumInstructionsLength} Zeichen lang sein.`)
  return cleaned
}

function validStoredInstructions(value, fallback) {
  return typeof value === 'string' && value.trim() && value.trim().length <= maximumInstructionsLength ? value.trim() : fallback
}

function promptData(id, value = {}) {
  const definition = definitions[id]
  const draftInstructions = validStoredInstructions(value?.draft?.instructions, definition.defaultInstructions)
  const publishedInstructions = validStoredInstructions(value?.published?.instructions, definition.defaultInstructions)
  return {
    id,
    displayName: definition.displayName,
    description: definition.description,
    defaultInstructions: definition.defaultInstructions,
    draft: { instructions: draftInstructions, updatedAt: value?.draft?.updatedAt || null },
    published: { instructions: publishedInstructions, publishedAt: value?.published?.publishedAt || null },
  }
}

async function assertSuperadmin(request) {
  return requireRole(await requireActiveProfile(request), ['superadmin'], 'Diese Aktion ist nur für Superadmins erlaubt.')
}

export async function getPublishedAiPromptInstructions(id) {
  const definition = definitions[id]
  if (!definition) return ''
  try {
    const snapshot = await getFirestore().doc(`${collection}/${id}`).get()
    return validStoredInstructions(snapshot.data()?.published?.instructions, definition.defaultInstructions)
  } catch (error) {
    // The configurable prompt is an optional addition. A temporary Firestore
    // issue must never prevent an operational AI flow such as status-mail
    // processing from continuing with its vetted default instruction.
    logger.warn('Veröffentlichte KI-Fachanweisung konnte nicht geladen werden; Standardanweisung wird verwendet.', {
      promptId: id,
      error: error instanceof Error ? error.message : String(error),
    })
    return definition.defaultInstructions
  }
}

export const listAiPromptConfigs = onCall({ region, enforceAppCheck: true }, async (request) => {
  await assertSuperadmin(request)
  const database = getFirestore()
  const snapshots = await Promise.all(Object.keys(definitions).map((id) => database.doc(`${collection}/${id}`).get()))
  return { prompts: snapshots.map((snapshot) => promptData(snapshot.id, snapshot.exists ? snapshot.data() : {})) }
})

export const saveAiPromptDraft = onCall({ region, enforceAppCheck: true }, async (request) => {
  await assertSuperadmin(request)
  const { id, instructions } = request.data || {}
  if (typeof id !== 'string' || !Object.hasOwn(definitions, id)) throw new HttpsError('invalid-argument', 'Unbekanntes KI-Feature.')
  const clean = cleanInstructions(instructions)
  const reference = getFirestore().doc(`${collection}/${id}`)
  await reference.set({ id, draft: { instructions: clean, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid } }, { merge: true })
  const saved = await reference.get()
  return { prompt: promptData(id, saved.data()) }
})

export const publishAiPromptDraft = onCall({ region, enforceAppCheck: true }, async (request) => {
  await assertSuperadmin(request)
  const id = request.data?.id
  if (typeof id !== 'string' || !Object.hasOwn(definitions, id)) throw new HttpsError('invalid-argument', 'Unbekanntes KI-Feature.')
  const reference = getFirestore().doc(`${collection}/${id}`)
  const snapshot = await reference.get()
  const instructions = validStoredInstructions(snapshot.data()?.draft?.instructions, definitions[id].defaultInstructions)
  await reference.set({ id, published: { instructions, publishedAt: FieldValue.serverTimestamp(), publishedBy: request.auth.uid } }, { merge: true })
  const saved = await reference.get()
  return { prompt: promptData(id, saved.data()) }
})

export const resetAiPromptDraft = onCall({ region, enforceAppCheck: true }, async (request) => {
  await assertSuperadmin(request)
  const id = request.data?.id
  if (typeof id !== 'string' || !Object.hasOwn(definitions, id)) throw new HttpsError('invalid-argument', 'Unbekanntes KI-Feature.')
  const reference = getFirestore().doc(`${collection}/${id}`)
  await reference.set({ id, draft: { instructions: definitions[id].defaultInstructions, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid } }, { merge: true })
  const saved = await reference.get()
  return { prompt: promptData(id, saved.data()) }
})
