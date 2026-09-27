// Source of truth for client and Functions. functions/shared/ is a generated
// deploy-safe copy; run `npm run sync:functions-shared`, never edit it by hand.
export const TRANSPORT_RATING_CRITERIA = Object.freeze({
  customer: Object.freeze([
    { key: 'compensation', label: 'Vergütung', description: 'Preis für diesen Transport' },
    { key: 'orderQuality', label: 'Auftragsqualität', description: 'Vollständigkeit und Korrektheit der Auftragsdaten' },
    { key: 'cooperation', label: 'Zusammenarbeit', description: 'Kommunikation und Erreichbarkeit' },
  ]),
  carrier: Object.freeze([
    { key: 'punctuality', label: 'Termintreue', description: 'Pünktlichkeit an Lade- und Entladestellen' },
    { key: 'communication', label: 'Kommunikation', description: 'Erreichbarkeit und Rückmeldungen' },
    { key: 'execution', label: 'Transportdurchführung', description: 'Zuverlässigkeit und Einhaltung der Anforderungen' },
    { key: 'price', label: 'Preis', description: 'Preis-Leistungs-Verhältnis dieses Transportes' },
  ]),
})

export function validateTransportRating(partnerRole, scores, comment = '') {
  const criteria = TRANSPORT_RATING_CRITERIA[partnerRole]
  if (!criteria) throw new Error('Ungültige Partnerrolle.')
  if (!scores || typeof scores !== 'object' || Array.isArray(scores)) throw new Error('Ungültige Bewertung.')
  if (typeof comment !== 'string' || comment.length > 250) throw new Error('Der Kommentar darf höchstens 250 Zeichen enthalten.')
  const allowed = new Set(criteria.map(({ key }) => key))
  if (Object.keys(scores).some((key) => !allowed.has(key))) throw new Error('Ungültiges Bewertungskriterium.')
  const selected = Object.entries(scores).filter(([, value]) => value !== null && value !== undefined)
  if (!selected.length) throw new Error('Bitte mindestens ein Kriterium bewerten.')
  if (selected.some(([, value]) => !Number.isInteger(value) || value < 1 || value > 5)) throw new Error('Sterne müssen ganze Zahlen von 1 bis 5 sein.')
  const cleanScores = Object.fromEntries(selected)
  const averageScore = selected.reduce((sum, [, value]) => sum + value, 0) / selected.length
  return { scores: cleanScores, averageScore, comment: comment.trim() }
}
