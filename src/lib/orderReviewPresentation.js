export const orderReviewColors = ['green', 'yellow', 'red', 'blue', 'gray']
const empty = value => value === null || value === undefined || value === '' || value === false

// Counts describe form readiness, not a database comparison or AI confidence.
export function orderReviewCounts(entries, issues = []) {
  const counts = Object.fromEntries(orderReviewColors.map(color => [color, 0]))
  for (const entry of entries) {
    const problems = issues.filter(issue => issue.path === entry.path)
    const color = entry.color || (problems.some(issue => issue.severity === 'error') ? (empty(entry.value) ? 'yellow' : 'red') : problems.length ? 'yellow' : empty(entry.value) ? 'gray' : entry.manual ? 'green' : 'blue')
    counts[color]++
  }
  return counts
}

export function orderReviewEntries(value, prefix = '') {
  if (Array.isArray(value)) return value.flatMap((item, index) => orderReviewEntries(item, `${prefix}.${index}`))
  if (value && typeof value === 'object') return Object.entries(value).filter(([key]) => !['id', 'type'].includes(key)).flatMap(([key, item]) => orderReviewEntries(item, prefix ? `${prefix}.${key}` : key))
  return [{ path: prefix, value }]
}
