export const QUALITY_PATH = '/qualitaet'

export const qualityTabs = Object.freeze([
  { id: 'overview', path: QUALITY_PATH, de: 'Übersicht', en: 'Overview' },
  { id: 'kvp', path: '/qualitaet/kvp', module: 'kvp', de: 'K.V.P.', en: 'Continuous improvement' },
  { id: 'handbook', path: '/qualitaet/handbuch', module: 'handbook', de: 'Handbuch', en: 'Handbook' },
  { id: 'rules', path: '/qualitaet/grundregeln', module: 'handbook', de: 'Grundregeln', en: 'Ground rules' },
  { id: 'mail-triage', path: '/qualitaet/maileinordnung', module: 'mailTriageQuality', de: 'Maileinordnung', en: 'Mail classification' },
  { id: 'gaps', path: '/qualitaet/wissensluecken', module: 'knowledgeGaps', de: 'Wissenslücken', en: 'Knowledge gaps' },
])

export const qualityModules = [...new Set(qualityTabs.flatMap(tab => tab.module ? [tab.module] : []))]

export function isQualityPath(pathname) {
  return qualityTabs.some(tab => pathname === tab.path || tab.module && pathname.startsWith(`${tab.path}/`))
}
