// Fetch only the redirect chain and its descendants. Older chained merges remain
// valid; this must not assume that all historical redirects are already flat.
export async function loadPartnerCluster(partnerId, { readPartner, readChildren }) {
  const visited = new Set()
  let current = await readPartner(partnerId)
  while (current?.mergedIntoPartnerId) {
    if (visited.has(current.id)) throw new Error('Zyklische Partner-Weiterleitung.')
    visited.add(current.id)
    const targetId = typeof current.mergedIntoPartnerId === 'string' ? current.mergedIntoPartnerId.trim() : ''
    if (!targetId || targetId === current.id) throw new Error('Ungültige Partner-Weiterleitung.')
    current = await readPartner(targetId)
    if (!current) throw new Error('Weiterleitungsziel nicht vorhanden.')
  }
  if (!current) return { root: null, members: [] }
  if (current.status === 'merged') throw new Error('Archivierter Partner ohne aktives Weiterleitungsziel.')
  const root = current
  const members = new Map([[root.id, root]])
  let frontier = [root.id]
  while (frontier.length) {
    const children = await readChildren(frontier)
    frontier = []
    for (const child of children) {
      if (members.has(child.id)) continue
      members.set(child.id, child)
      frontier.push(child.id)
    }
  }
  return { root, members: [...members.values()] }
}
