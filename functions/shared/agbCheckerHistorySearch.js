export function normalizeAgbHistoryName(value = '') {
  return value.toLocaleLowerCase('de').replace(/ß/g, 'ss').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()
}

export function agbHistorySearchTokens(name) {
  const normalized = normalizeAgbHistoryName(name)
  const tokens = new Set()
  for (let size = 1; size <= 3; size += 1) {
    for (let index = 0; index <= normalized.length - size; index += 1) tokens.add(normalized.slice(index, index + size))
  }
  return [...tokens]
}
