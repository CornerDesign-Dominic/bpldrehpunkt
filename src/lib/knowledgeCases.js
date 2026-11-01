export const activeKnowledgeCases = (cases) => cases.filter((item) => item.removed !== true)
export const knowledgeCasePending = (item) => !Number.isSafeInteger(item.caseRevision) || !Number.isSafeInteger(item.learnedRevision) || item.learnedRevision < item.caseRevision
export function knowledgeCaseGroups(groups, cases, articles = []) {
  const active = activeKnowledgeCases(cases)
  const records = [...groups]
  for (const article of articles) {
    const id = `article-${article.id}`
    const existing = records.findIndex((group) => group.id === id)
    const metadata = { title: article.title, process: article.process, topic: article.topic, articleId: article.id, category: 'article' }
    if (existing >= 0) records[existing] = { ...records[existing], ...metadata }
    else records.push({ id, ...metadata, revision: 0, virtual: true })
  }
  if (!records.some((group) => group.id === 'unassigned')) records.push({ id: 'unassigned', title: 'Nicht zugeordnet', category: 'unassigned', revision: 0, virtual: true })
  return records.map((group) => {
    const items = active.filter((item) => (item.gapId || 'unassigned') === group.id)
    return { ...group, cases: items, caseCount: items.length, pendingCount: items.filter(knowledgeCasePending).length }
  }).sort((left, right) => right.pendingCount - left.pendingCount || right.caseCount - left.caseCount || left.title.localeCompare(right.title))
}
export function knowledgeCaseAnswer(item) {
  if (['accepted', 'unknown'].includes(item.sendStatus) && item.sentReply) return { text: item.sentReply, kind: item.sendStatus }
  return { text: item.latestSuggestion || '', kind: 'draft' }
}
export function knowledgeCaseSelection(cases, ids) {
  const wanted = new Set(ids)
  return activeKnowledgeCases(cases).filter((item) => wanted.has(item.id)).map((item) => ({ id: item.id, caseRevision: item.caseRevision }))
}
