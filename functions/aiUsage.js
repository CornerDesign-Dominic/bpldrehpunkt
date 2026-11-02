import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { recordDiagnostic } from './diagnostics.js'

export const AI_USAGE_COLLECTION = 'aiUsage'

// Prices are USD per one million tokens. Keep this registry as the single
// update point whenever an OpenAI model or its pricing changes.
export const AI_MODEL_PRICING = Object.freeze({
  'gpt-5.4': { inputPerMillionUsd: 2.5, outputPerMillionUsd: 15 },
})

function tokenCount(value) {
  return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0
}

function safeDuration(value) {
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : 0
}

export function calculateAiCost({ model, inputTokens, outputTokens }) {
  const pricing = AI_MODEL_PRICING[model]
  if (!pricing) return null
  const cost = ((tokenCount(inputTokens) / 1_000_000) * pricing.inputPerMillionUsd) + ((tokenCount(outputTokens) / 1_000_000) * pricing.outputPerMillionUsd)
  return Math.round(cost * 1_000_000_000) / 1_000_000_000
}

export function getOpenAiTokenUsage(usage = {}) {
  const inputTokens = tokenCount(usage.input_tokens)
  const outputTokens = tokenCount(usage.output_tokens)
  const totalTokens = tokenCount(usage.total_tokens) || inputTokens + outputTokens
  return { inputTokens, outputTokens, totalTokens }
}

export function getAiErrorType(error) {
  if (error?.errorType) return error.errorType
  if (error?.name === 'AbortError') return 'timeout'
  if (Number.isInteger(error?.status)) return error.status >= 500 ? 'provider_server_error' : 'provider_request_error'
  return 'internal_error'
}

export async function logAiUsage({ feature, userId, model, usage, durationMs, success, errorType = null, fileSize, pageCount, requestId }) {
  const { inputTokens, outputTokens, totalTokens } = getOpenAiTokenUsage(usage)
  const entry = {
    feature,
    timestamp: FieldValue.serverTimestamp(),
    userId,
    model,
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCost: calculateAiCost({ model, inputTokens, outputTokens }),
    durationMs: safeDuration(durationMs),
    success: success === true,
    errorType: success ? null : errorType || 'internal_error',
  }
  if (Number.isFinite(fileSize) && fileSize >= 0) entry.fileSize = Math.trunc(fileSize)
  if (Number.isInteger(pageCount) && pageCount > 0) entry.pageCount = pageCount
  if (typeof requestId === 'string' && requestId) entry.requestId = requestId.slice(0, 200)
  await getFirestore().collection(AI_USAGE_COLLECTION).add(entry)
}

// Wrap every server-side AI request with uniform, content-free usage logging.
// `operation` may return `usage`, `requestId`, `fileSize`, and `pageCount`.
async function reportUsageFailure(error, entry) {
  const errorType = getAiErrorType(error)
  logger.error('KI-Usage konnte nicht protokolliert werden.', { feature: entry.feature, userId: entry.userId, errorType })
  await recordDiagnostic({ module: 'background-work', stage: 'ai-usage', code: errorType, message: 'Die KI-Nutzung konnte nicht protokolliert werden; das fachliche Ergebnis bleibt erhalten.', actorId: entry.userId || 'system' })
}

export async function executeAiOperation({ feature, userId, model, operation }, { writeUsage = logAiUsage, reportUsageError = reportUsageFailure } = {}) {
  const startedAt = Date.now()
  const writeSafely = async (entry) => {
    try { await writeUsage(entry) }
    catch (error) {
      // Telemetry must neither turn an accepted result into a failed operation
      // nor replace the provider's original error and provoke a paid retry.
      try { await reportUsageError(error, entry) }
      catch { logger.warn('KI-Nutzungsdiagnose fehlgeschlagen.', { feature }) }
    }
  }
  let result
  try { result = await operation() }
  catch (error) {
    await writeSafely({ feature, userId, model, usage: error?.usage, durationMs: Date.now() - startedAt, success: false, errorType: getAiErrorType(error), fileSize: error?.fileSize, pageCount: error?.pageCount, requestId: error?.requestId })
    throw error
  }
  await writeSafely({ feature, userId, model, usage: result?.usage, durationMs: Date.now() - startedAt, success: true, fileSize: result?.fileSize, pageCount: result?.pageCount, requestId: result?.requestId })
  return result
}
