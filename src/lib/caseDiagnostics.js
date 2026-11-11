import { reportTechnicalFailure } from './diagnostics.js'
import { createCaseDiagnosticReporter } from './caseDiagnosticOperation.js'

const reporter = createCaseDiagnosticReporter(reportTechnicalFailure)
export const caseOperation = reporter.operation
export const reportCaseFailure = reporter.reportFailure
