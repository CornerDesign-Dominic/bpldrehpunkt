const EXPECTED_CODES = new Set(['invalid-argument', 'failed-precondition', 'not-found', 'already-exists', 'permission-denied', 'unauthenticated', 'cancelled'])
const TECHNICAL_CODES = new Set(['unavailable', 'deadline-exceeded', 'internal', 'unknown', 'resource-exhausted'])

const MISSING_DOCUMENT_ASSET_CODES = new Set(['signature/not-uploaded', 'storage/object-not-found'])
const ACCESS_DOCUMENT_ASSET_CODES = new Set([
  'functions/permission-denied', 'functions/unauthenticated',
  'storage/unauthorized', 'storage/permission-denied', 'storage/unauthenticated',
])

export function documentAssetDiagnosticCode(error) {
  const code = typeof error?.code === 'string' ? error.code : ''
  if (MISSING_DOCUMENT_ASSET_CODES.has(code) || code === 'storage/canceled') return null
  if (code === 'functions/not-found') return 'unavailable'
  if (ACCESS_DOCUMENT_ASSET_CODES.has(code)) return 'access-failure'
  if (code === 'signature/timeout' || code === 'storage/retry-limit-exceeded') return 'deadline-exceeded'
  if (code === 'storage/quota-exceeded') return 'resource-exhausted'
  if (code === 'diagnostic/invalid-response') return 'invalid-response'
  return diagnosticCode(error)
}

export function diagnosticCode(error) {
  const raw = typeof error?.code === 'string' ? error.code : ''
  const code = raw.replace(/^(functions|firestore)\//, '')
  if (EXPECTED_CODES.has(code)) return null
  return TECHNICAL_CODES.has(code) ? code : 'unknown'
}

export function websiteDiagnosticStage(pathname) {
  if (pathname.startsWith('/dashboard')) return 'dashboard'
  if (pathname.startsWith('/transportauftraege')) return 'transport-orders'
  if (pathname.startsWith('/kunden-unternehmer')) return 'partners'
  if (pathname.startsWith('/crm')) return 'crm'
  if (pathname.startsWith('/admin')) return 'administration'
  return 'other'
}
