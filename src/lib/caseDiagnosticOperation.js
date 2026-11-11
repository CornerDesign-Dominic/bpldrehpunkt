import { caseDiagnosticCode } from './diagnosticClassification.js'

export function createCaseDiagnosticReporter(report) {
  const reportFailure = (module, stage, error) => {
    const code = caseDiagnosticCode(error)
    if (!code) return
    // Never forward error text, operation arguments, IDs, filenames or case contents.
    // A reporting failure must not change the result of the original operation.
    try { void Promise.resolve(report({ module, stage, code })).catch(() => {}) } catch { /* best effort */ }
  }
  const operation = (module, stage, action) => async (...args) => {
    try { return await action(...args) } catch (error) {
      reportFailure(module, stage, error)
      throw error
    }
  }
  return { reportFailure, operation }
}
