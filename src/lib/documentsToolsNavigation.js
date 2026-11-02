export const DOCUMENTS_TOOLS_PATH = '/dokumente-werkzeuge'

export const documentsToolsTabs = Object.freeze([
  { id: 'overview', path: DOCUMENTS_TOOLS_PATH, de: 'Übersicht', en: 'Overview' },
  { id: 'holidays', path: '/feiertagskalender', module: 'feiertagskalender', de: 'Feiertagskalender', en: 'Holiday calendar' },
  { id: 'documents', path: '/dokumente', module: 'documents', de: 'Dokumente', en: 'Documents' },
  { id: 'templates', path: '/vorlagen', module: 'templates', de: 'Vorlagen', en: 'Templates' },
  { id: 'terms', path: '/agb-pruefer', module: 'agbChecker', de: 'AGB-Prüfer', en: 'Terms checker' },
])

export const documentsToolsModules = documentsToolsTabs.flatMap(tab => tab.module ? [tab.module] : [])

export function isDocumentsToolsPath(pathname) {
  return documentsToolsTabs.some(tab => pathname === tab.path || tab.module && pathname.startsWith(`${tab.path}/`))
}
