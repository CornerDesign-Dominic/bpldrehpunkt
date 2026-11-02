// Resolve a normal reference at the destination. The URL and the referring
// record retain the origin ID; only an explicit archive request bypasses it.
export async function resolvePartnerReference(partnerId, readPartner, { archive = false } = {}) {
  if (!partnerId) return null
  let current = await readPartner(partnerId)
  if (archive) return current
  const visited = new Set()
  while (current?.mergedIntoPartnerId) {
    if (visited.has(current.id)) throw new Error('Zyklische Partner-Weiterleitung.')
    visited.add(current.id)
    const targetId = typeof current.mergedIntoPartnerId === 'string' ? current.mergedIntoPartnerId.trim() : ''
    if (!targetId || targetId === current.id) throw new Error('Ungültige Partner-Weiterleitung.')
    current = await readPartner(targetId)
    if (!current) throw new Error('Weiterleitungsziel nicht vorhanden.')
  }
  if (current?.status === 'merged') throw new Error('Archivierter Partner ohne Zielpartner.')
  return current
}

export function partnerReferenceVersion(partner) {
  if (!partner) return ''
  const time = partner.updatedAt
  return JSON.stringify([partner.id, partner.mergedIntoPartnerId || '', partner.latestMergeId || '', partner.status || '', time?.seconds ?? null, time?.nanoseconds ?? null])
}

export function assertCurrentPartnerReference(partner, partnerId, expectedVersion) {
  if (!partner || partner.id !== partnerId || partner.mergedIntoPartnerId || partner.status === 'merged'
    || (expectedVersion !== undefined && partnerReferenceVersion(partner) !== expectedVersion)) {
    throw Object.assign(new Error('Die Partnerzuordnung oder die Stammdaten wurden inzwischen geändert. Bitte die Seite vor dem Speichern neu laden.'), { code: 'failed-precondition' })
  }
}
