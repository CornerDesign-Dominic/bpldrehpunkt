export const transportOrderWorkspaceTabs = ['overview', 'transport', 'partners', 'finance', 'history']

export function transportOrderWorkspaceScope(tab) {
  return tab === 'partners' ? 'partners' : tab === 'overview' ? 'all' : tab === 'history' ? null : 'order'
}

export function transportOrderResult(financial) {
  return Number.isFinite(financial?.revenueNet) && Number.isFinite(financial?.costNet)
    ? Math.round((financial.revenueNet - financial.costNet) * 100) / 100 : null
}

// Preserve source stop order; fall back only for pre-structured CSV imports.
export function transportOrderWorkspaceStops(imported = {}) {
  if (Array.isArray(imported.stops)) return imported.stops
  return [['loading', imported.loading], ['unloading', imported.unloading]].flatMap(([type, value]) => value && (value.city || value.originalText || value.window?.from || value.note || value.reference)
    ? [{ ...value, sourceId: `legacy-${type}`, type, address: { city: value.city }, deliveryInformation: value.reference, legacy: true }] : [])
}

export function transportOrderRefreshTime(entry) {
  const value = entry?.completedAt || entry?.createdAt || entry?.startedAt
  if (value?.toMillis) return value.toMillis()
  if (value?.seconds) return value.seconds * 1000
  const result = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : 0
  return Number.isFinite(result) ? result : 0
}

export function latestTransportOrderRefresh(refreshes, scope) {
  return refreshes.filter((entry) => entry.scope === scope || (scope !== 'all' && entry.scope === 'all'))
    .slice().sort((a, b) => transportOrderRefreshTime(b) - transportOrderRefreshTime(a))[0] || null
}

// A confirmed callable receipt remains visible when the history reload fails.
// Once its server document arrives, prefer that document and show it only once.
export function mergeTransportOrderRefreshes(serverEntries = [], localEntries = []) {
  const entries = new Map()
  for (const entry of [...serverEntries, ...localEntries]) if (!entries.has(entry.id)) entries.set(entry.id, entry)
  return [...entries.values()].sort((a, b) => transportOrderRefreshTime(b) - transportOrderRefreshTime(a))
}
