export const CASE_MANAGEMENT_PATH = '/fallmanagement'

export const caseManagementTabs = Object.freeze([
  { id: 'overview', path: CASE_MANAGEMENT_PATH, de: 'Übersicht', en: 'Overview' },
  { id: 'damages', path: '/schaeden', module: 'damages', de: 'Schäden', en: 'Damages' },
  { id: 'inkasso', path: '/inkasso', module: 'inkasso', de: 'Inkasso', en: 'Debt collection' },
  { id: 'legalDisputes', path: '/legal-disputes', module: 'legalDisputes', de: 'Gericht', en: 'Court' },
  { id: 'insolvencies', path: '/insolvenzen', module: 'insolvencies', de: 'Insolvenzen', en: 'Insolvencies' },
])

export const caseManagementModules = caseManagementTabs.flatMap(tab => tab.module ? [tab.module] : [])

export function isCaseManagementPath(pathname) {
  return caseManagementTabs.some(tab => pathname === tab.path || tab.module && pathname.startsWith(`${tab.path}/`))
}
