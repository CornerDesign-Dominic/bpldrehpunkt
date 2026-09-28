import { httpsCallable } from 'firebase/functions'
import { auth, functions, waitForAppCheckToken } from './firebase.js'
import { diagnosticCode } from './diagnosticClassification.js'

export const DIAGNOSTIC_MODULE_LABELS = Object.freeze({
  'transport-route': 'Streckenberechnung',
  'tracking-preview': 'Tracking-Vorschau',
  'shipment-tracking': 'Sendungsverfolgung',
  'shipment-tracking-manual-mail': 'Manuelle Tracking-Anfrage',
  'document-templates': 'Dokumentvorlagen',
  website: 'Website',
})

const recentReports = new Map()

export async function reportTechnicalFailure({ module, stage, error, orderId, code }) {
  if (!auth.currentUser) return false
  const classified = code || diagnosticCode(error)
  if (!classified) return false
  const fingerprint = `${module}|${stage}|${classified}|${orderId || ''}`
  const now = Date.now()
  if (now - (recentReports.get(fingerprint) || 0) < 60_000) return false
  recentReports.set(fingerprint, now)
  if (recentReports.size > 100) for (const [key, time] of recentReports) if (now - time > 60_000) recentReports.delete(key)
  try {
    await waitForAppCheckToken()
    await httpsCallable(functions, 'reportClientDiagnostic')({ module, stage, code: classified, ...(orderId ? { orderId } : {}) })
    return true
  } catch {
    // Reporting is best effort and must not hide or alter the original failure.
    return false
  }
}

export async function listDiagnosticsPage(filters = {}) {
  const result = await httpsCallable(functions, 'listDiagnosticsPage')(filters)
  return { entries: Array.isArray(result.data?.entries) ? result.data.entries : [], nextCursor: result.data?.nextCursor || null }
}
