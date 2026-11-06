export const MAX_CONTRACT_ALLOCATIONS = 50

export function parseAllocationPercent(value) {
  const source = String(value ?? '').trim()
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(source)) return null
  const [whole, fraction = ''] = source.replace(',', '.').split('.')
  const basisPoints = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(basisPoints) && basisPoints > 0 && basisPoints <= 10000 ? basisPoints : null
}

export function allocationPercentInput(basisPoints) {
  return Number.isInteger(basisPoints) && basisPoints > 0 && basisPoints <= 10000
    ? (basisPoints / 100).toFixed(2).replace(/\.?0+$/, '') : ''
}

export function allocationDraft(allocations = []) {
  return allocations.map(item => ({ categoryId: item.categoryId, percent: allocationPercentInput(item.basisPoints) }))
}

function invalid(reason) {
  const error = new Error(`Invalid contract allocation: ${reason}`)
  error.code = `contract-allocation/${reason}`
  throw error
}

export function normalizeContractAllocations(rows, categories, previous = []) {
  if (!Array.isArray(rows) || rows.length > MAX_CONTRACT_ALLOCATIONS) invalid('limit')
  const categoryMap = new Map(categories.map(category => [category.id, category]))
  const ids = new Set()
  const allocations = rows.map(row => {
    if (typeof row.categoryId !== 'string' || !row.categoryId.trim() || row.categoryId !== row.categoryId.trim()) invalid('category')
    if (ids.has(row.categoryId)) invalid('duplicate')
    ids.add(row.categoryId)
    const basisPoints = parseAllocationPercent(row.percent)
    if (basisPoints === null) invalid('percent')
    const category = categoryMap.get(row.categoryId)
    if (!category) invalid('unresolved')
    if (category.active !== true && !previous.some(item => item.categoryId === row.categoryId && item.basisPoints === basisPoints)) invalid('inactive')
    return { categoryId: row.categoryId, basisPoints }
  })
  if (allocations.length && allocations.reduce((total, item) => total + item.basisPoints, 0) !== 10000) invalid('total')
  return allocations
}
