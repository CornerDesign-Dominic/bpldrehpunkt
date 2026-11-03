// Assignment confidence is distinct from invoice correctness. A wrong amount
// must remain a visible invoice mismatch, not erase a documented order link.
const matched = check => check.color === 'green' || !check.color && check.status === 'match'
export function invoiceAssignmentEvidence(candidate) {
  const checks = candidate.checks || []
  const has = key => checks.some(check => check.key === key && matched(check))
  const detailKeys = ['loadingCity', 'unloadingCity', 'loadingDate', 'unloadingDate', 'deliveryDate', 'licensePlate']
  const details = detailKeys.filter(key => checks.some(check => check.key.startsWith(`${key}-`) && matched(check)))
    .filter((key, _index, keys) => key !== 'deliveryDate' || !keys.includes('unloadingDate'))
  const issuer = has('issuer') && !checks.some(check => check.key === 'issuer' && check.matchedBy === 'vatId'), vat = has('issuerVatId'), net = has('net')
  const identity = issuer || vat
  // Recipient and our VAT ID are deliberately excluded: every incoming invoice
  // may carry them, so they do not distinguish one carrier/order from another.
  return { identity, issuer, vat, net, details, strong: identity && (net || details.length >= 2 || issuer && vat && details.length >= 1),
    score: (issuer ? 30 : 0) + (vat ? 35 : 0) + (net ? 40 : 0) + details.length * 10 }
}

export function rankInvoiceAssignments(candidates) {
  return candidates.map(candidate => ({ ...candidate, assignmentEvidence: invoiceAssignmentEvidence(candidate) }))
    .sort((a, b) => b.assignmentEvidence.score - a.assignmentEvidence.score || a.ta.localeCompare(b.ta))
}

export function chooseInvoiceAssignment(candidates, { explicitTa = '', complete = true } = {}) {
  if (!complete || !candidates.length) return null
  const ranked = rankInvoiceAssignments(candidates)
  // A literal, explicitly labelled invoice reference plus carrier identity is
  // enough even if the price is wrong. Multiple equally plausible candidates
  // cannot be resolved by list order or by the recipient's identity.
  const explicit = ranked.find(candidate => candidate.ta === explicitTa)
  if (explicit?.assignmentEvidence.identity) return explicit
  const best = ranked[0], second = ranked[1]
  return best.assignmentEvidence.strong && (!second || best.assignmentEvidence.score - second.assignmentEvidence.score >= 15) ? best : null
}
