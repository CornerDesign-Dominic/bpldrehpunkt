const sources = [
  { module: 'damages', type: 'damage', label: 'Schäden', collection: 'damageCases', fields: ['claimantPartnerId', 'contractorPartnerId'] },
  { module: 'insolvencies', type: 'insolvency', label: 'Insolvenzen', collection: 'insolvencies', fields: ['partnerId', '__name__'] },
  { module: 'inkasso', type: 'inkasso', label: 'Inkasso', collection: 'inkassoCases', fields: ['debtorPartnerId'] },
  { module: 'legalDisputes', type: 'legalDispute', label: 'Gericht / Streit', collection: 'legalDisputes', fields: ['counterpartyPartnerId'] },
  { module: 'todos', type: 'todo', label: 'To-dos', collection: 'todos', fields: ['customerId', 'carrierId'] },
  { module: 'transportOrders', type: 'transportOrder', label: 'Transportaufträge', collection: 'transportOrders', fields: ['imported.customer.partnerId', 'imported.carrier.partnerId'] },
]

export function partnerRelatedRecordPlan(memberIds, allowedModules) {
  const ids = [...new Set(memberIds.filter((id) => typeof id === 'string' && id))]
  return sources.filter((source) => allowedModules.includes(source.module)).map((source) => ({
    ...source,
    queries: source.type === 'todo' ? [] : source.fields.flatMap((field) => {
      const groups = []
      for (let index = 0; index < ids.length; index += 10) groups.push({ field, ids: ids.slice(index, index + 10) })
      return groups
    }),
  }))
}

export function filterPartnerTodos(todos, memberIds) {
  const ids = new Set(memberIds)
  return todos.filter((todo) => ids.has(todo.customerId) || ids.has(todo.carrierId))
}

export function collectRelatedRecordResults(results, type) {
  const records = new Map()
  let failedQueries = 0
  for (const result of results) {
    if (result.status === 'rejected') { failedQueries += 1; continue }
    for (const record of result.value) {
      // The insolvency detail/list contract excludes merge and split shells.
      // Other cases retain their original partner references after a merge.
      if (type === 'insolvency' && (record.splitArchivedAt || record.mergedIntoPartnerId)) continue
      records.set(record.id, record)
    }
  }
  return { records: [...records.values()], failedQueries }
}
