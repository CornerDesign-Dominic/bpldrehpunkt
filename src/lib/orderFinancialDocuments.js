export function orderFinancialDocumentGroups(documents = []) {
  const groups = new Map(['customer', 'carrier', 'unknown'].map(side => [side, []]))
  documents.forEach((document, index) => {
    const side = groups.has(document.side) ? document.side : 'unknown'
    groups.get(side).push({ document, anchor: `order-financial-document-${encodeURIComponent(document.sourceId || document.id || `legacy-${index}`)}` })
  })
  return [...groups].map(([side, entries]) => ({ side, entries }))
}

export function orderFinancialDocumentOriginal(document, groups) {
  if (!document.originalDocumentSourceId) return null
  return groups.flatMap(group => group.entries).find(entry => entry.document.sourceId === document.originalDocumentSourceId) || null
}
