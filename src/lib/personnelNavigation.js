export const HUMAN_RESOURCES_PATH = '/personalwesen'

export const personnelTabs = Object.freeze([
  { id: 'overview', path: HUMAN_RESOURCES_PATH, de: 'Übersicht', en: 'Overview' },
  { id: 'personnel', path: '/personal', module: 'personnel', de: 'Personal', en: 'Personnel' },
])

export const personnelModules = ['personnel']

export function isPersonnelPath(pathname) {
  return personnelTabs.some(tab => pathname === tab.path || tab.module && pathname.startsWith(`${tab.path}/`))
}
