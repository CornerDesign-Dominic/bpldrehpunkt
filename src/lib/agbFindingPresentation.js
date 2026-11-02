// Existing saved findings embed their document citation at the beginning.
// Split only recognizable citations, never arbitrary bracketed finding text.
export function splitAgbFinding(value) {
  const match = /^\[([^\]\r\n]+)\]\s*(\S[\s\S]*)$/.exec(value)
  if (!match || !(/\.pdf\b/i.test(match[1]) || /^(?:S\.|Seiten?|Pages?)\s*\d/i.test(match[1]))) return { text: value, source: '' }
  return { text: match[2], source: match[1] }
}
