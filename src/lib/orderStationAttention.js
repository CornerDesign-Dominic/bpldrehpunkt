const neutral = 'neutral(?:e[rmns]?)?'
const actions = 'abholung|abholen|abgeholt|anlieferung|anliefern|angeliefert|zustellung|zustellen|zugestellt|lieferung|liefern|geliefert'

function explicitNeutral(text, type, allowStandalone = false) {
  if (typeof text !== 'string') return null
  const normalized = text.toLowerCase().replace(/[‐‑–—-]/g, ' ').trim()
  const target = type === 'loading' ? 'abholung|abholen|abgeholt' : 'anlieferung|anliefern|angeliefert|zustellung|zustellen|zugestellt|lieferung|liefern|geliefert'
  const patterns = [
    new RegExp(`\\b${neutral}\\s+(?:(?:${actions})\\s*(?:und|/|&)\\s*)?(?:${target})\\b`, 'g'),
    new RegExp(`\\b(?:${target})(?:\\s*(?:und|/|&)\\s*(?:${actions}))?\\s*(?:(?:erfolgt|ist|bitte|muss|soll|wird)\\s*)?:?\\s*(?:nicht\\s+)?${neutral}\\b`, 'g'),
  ]
  let decision = null
  for (const clause of normalized.split(/[.!?;\n]|\b(?:aber|jedoch|sondern)\b/)) {
    if (allowStandalone && /^(?:bitte\s+)?neutral\s*$/.test(clause.trim())) decision = true
    if (allowStandalone && /^(?:bitte\s+)?nicht\s+neutral\s*$/.test(clause.trim())) decision = false
    const matches = patterns.flatMap(pattern => [...clause.matchAll(pattern)]).sort((a, b) => a.index - b.index)
    for (const match of matches) {
      const before = clause.slice(0, match.index)
      const after = clause.slice(match.index + match[0].length)
      decision = !(/\b(?:nicht|kein(?:e[rmns]?)?|ohne)\s+(?:eine[nmrs]?\s+)?$/.test(before)
        || /\bnicht\s+neutral/.test(match[0])
        || /^\s*(?:ist\s+)?(?:nicht\s+(?:erforderlich|nötig|gewünscht)|entfällt|ausgeschlossen)\b/.test(after))
    }
  }
  return decision
}

// A visual hint from explicit instructions, never an inferred tracking fact.
// General instructions must name the action; a standalone NEUTRAL in the
// station's own note is scoped to that station. References are not searched.
export function orderStationAddressAttention(stop, dispositionNote) {
  if (!['loading', 'unloading'].includes(stop?.type)) return null
  const local = explicitNeutral(stop.note, stop.type, true)
  if ((local === null ? explicitNeutral(dispositionNote, stop.type) : local) !== true) return null
  return stop.type === 'loading' ? 'Neutrale Abholung' : 'Neutrale Anlieferung'
}
