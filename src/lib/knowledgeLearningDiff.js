export const KNOWLEDGE_LEARNING_TEXT_FIELDS = ['title', 'process', 'topic', 'tags', 'situation', 'checks', 'action', 'cautions', 'responseTemplate', 'followUp']
export const KNOWLEDGE_LEARNING_META_FIELDS = ['owner', 'status', 'lastReviewedDate', 'nextReviewDate', 'ruleIds']

const normalizeText = (value) => typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : ''
const tokens = (value) => value.match(/\s+|\S+/gu) || []
const MAX_DIFF_CELLS = 500000

function append(parts, type, text) {
  if (!text) return
  const previous = parts[parts.length - 1]
  if (previous?.type === type) previous.text += text
  else parts.push({ type, text })
}

// Every result reconstructs the normalized old text without added parts and
// the new text without removed parts. Large replacements use a coarse diff
// rather than allocating an unbounded word-comparison matrix.
export function diffKnowledgeText(beforeValue, afterValue) {
  const before = normalizeText(beforeValue)
  const after = normalizeText(afterValue)
  if (before === after) return before ? [{ type: 'equal', text: before }] : []
  if (!before) return [{ type: 'added', text: after }]
  if (!after) return [{ type: 'removed', text: before }]
  const left = tokens(before)
  const right = tokens(after)
  let start = 0
  while (start < left.length && start < right.length && left[start] === right[start]) start += 1
  let end = 0
  while (end < left.length - start && end < right.length - start && left[left.length - end - 1] === right[right.length - end - 1]) end += 1
  const oldMiddle = left.slice(start, left.length - end)
  const newMiddle = right.slice(start, right.length - end)
  const parts = []
  append(parts, 'equal', left.slice(0, start).join(''))
  const columns = newMiddle.length + 1
  if (!oldMiddle.length || !newMiddle.length || (oldMiddle.length + 1) * columns > MAX_DIFF_CELLS) {
    append(parts, 'removed', oldMiddle.join(''))
    append(parts, 'added', newMiddle.join(''))
  } else {
    const lengths = new Uint32Array((oldMiddle.length + 1) * columns)
    for (let i = oldMiddle.length - 1; i >= 0; i -= 1) {
      for (let j = newMiddle.length - 1; j >= 0; j -= 1) {
        lengths[i * columns + j] = oldMiddle[i] === newMiddle[j]
          ? lengths[(i + 1) * columns + j + 1] + 1
          : Math.max(lengths[(i + 1) * columns + j], lengths[i * columns + j + 1])
      }
    }
    let i = 0
    let j = 0
    while (i < oldMiddle.length && j < newMiddle.length) {
      if (oldMiddle[i] === newMiddle[j]) { append(parts, 'equal', oldMiddle[i]); i += 1; j += 1 }
      else if (lengths[(i + 1) * columns + j] >= lengths[i * columns + j + 1]) { append(parts, 'removed', oldMiddle[i]); i += 1 }
      else { append(parts, 'added', newMiddle[j]); j += 1 }
    }
    append(parts, 'removed', oldMiddle.slice(i).join(''))
    append(parts, 'added', newMiddle.slice(j).join(''))
  }
  if (end) append(parts, 'equal', left.slice(left.length - end).join(''))
  return parts
}

function matchingBase(article, run) {
  return article && typeof article === 'object' && !Array.isArray(article)
    && article.id === run.targetArticleId && Number.isSafeInteger(article.revision)
    && article.revision === run.targetArticleRevision
}
const fieldText = (article, key) => key === 'ruleIds'
  ? Array.isArray(article?.ruleIds) ? article.ruleIds.filter((id) => typeof id === 'string').join('\n') : ''
  : normalizeText(article?.[key])

export function buildKnowledgeLearningDiff(run, currentArticle) {
  const isNew = !run?.targetArticleId
  let baseArticle = null
  let basis = isNew ? 'new' : 'missing'
  if (!isNew && matchingBase(run?.baseArticle, run)) { baseArticle = run.baseArticle; basis = 'snapshot' }
  else if (!isNew && matchingBase(currentArticle, run)) { baseArticle = currentArticle; basis = 'current' }
  const missingBase = basis === 'missing'
  const result = run?.status === 'applied' && run.appliedValues ? run.appliedValues : run?.proposal
  const proposal = result && typeof result === 'object' && !Array.isArray(result) ? result : null
  const fields = proposal ? [...KNOWLEDGE_LEARNING_TEXT_FIELDS, ...KNOWLEDGE_LEARNING_META_FIELDS].map((key) => {
    const before = missingBase ? null : fieldText(baseArticle, key)
    let after = fieldText(proposal, key)
    // Applying an existing proposal preserves its article status. The server
    // deliberately stores generated proposals as drafts until human review.
    if (key === 'status') after = isNew ? 'draft' : normalizeText(baseArticle?.status) || (missingBase ? fieldText(proposal, key) : 'draft')
    else if (KNOWLEDGE_LEARNING_META_FIELDS.includes(key) && !Object.hasOwn(proposal, key) && baseArticle) after = fieldText(baseArticle, key)
    return { key, before, after, parts: missingBase ? [] : diffKnowledgeText(before, after), changed: !missingBase && before !== after }
  }) : []
  return { basis, baseArticle, proposal, isNew, missingBase, hasChanges: fields.some((field) => field.changed), fields }
}
