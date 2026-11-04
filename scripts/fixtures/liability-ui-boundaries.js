// External-effect boundaries for the mounted liability page tests.
export function liabilityCall(name, data) {
  const control = globalThis.__liabilityUiTest
  return new Promise((resolve, reject) => control.calls.push({ name, data, resolve, reject }))
}
export function reportTechnicalFailure() { return Promise.resolve(true) }
export function useCompanyStamp() {
  return { available: false, enabled: false, loading: false, error: '', toggle() {}, reset() {} }
}
export function usePersonalDocumentSignature() {
  return { usePersonalSignature: false, signatureLoading: false, signatureNoticeVisible: false, signatureNoticeMessage: '', signatureMissing: false, togglePersonalSignature() {}, ensurePersonalSignature: async () => true, resetPersonalSignature() {} }
}
export async function downloadLiabilityLetterPdf(documentData) { globalThis.__liabilityUiTest.pdf.push(structuredClone(documentData)) }
export async function printLiabilityLetterPdf(documentData) { globalThis.__liabilityUiTest.pdf.push(structuredClone(documentData)) }
