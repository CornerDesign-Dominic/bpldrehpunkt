const STORAGE_PREFIX = 'drehpunkt.sidebar.'

function storageKey(name, userId) {
  return typeof userId === 'string' && userId ? `${STORAGE_PREFIX}${name}.${userId}` : ''
}

function readArray(name, userId) {
  const key = storageKey(name, userId)
  if (!key || typeof window === 'undefined') return null

  try {
    const value = JSON.parse(window.localStorage.getItem(key))
    return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : null
  } catch {
    return null
  }
}

function writeArray(name, userId, values) {
  const key = storageKey(name, userId)
  if (!key || typeof window === 'undefined') return

  try {
    window.localStorage.setItem(key, JSON.stringify([...new Set(values)]))
  } catch {
    // Navigation remains usable when browser storage is unavailable.
  }
}

function allowedValues(values, allowed) {
  const allowedSet = new Set(allowed)
  return [...new Set((values || []).filter((value) => allowedSet.has(value)))]
}

export function readSidebarFavorites(userId, visibleItemIds) {
  return allowedValues(readArray('favorites', userId), visibleItemIds)
}

export function saveSidebarFavorites(userId, favoriteIds) {
  writeArray('favorites', userId, favoriteIds)
}

export function readSidebarExpandedGroups(userId, groupIds) {
  const savedGroups = readArray('expandedGroups', userId)
  // New navigation starts compact. The active route is opened by the sidebar
  // itself, so a direct link always remains visible.
  return savedGroups === null ? [] : allowedValues(savedGroups, groupIds)
}

export function saveSidebarExpandedGroups(userId, groupIds) {
  writeArray('expandedGroups', userId, groupIds)
}
