import { collection, getDocs } from 'firebase/firestore'
import { db } from './firebase.js'
import { partnerClusterMembers, resolvePartnerInIndex } from './partnerCluster.js'

export async function getPartnerCluster(partnerId) {
  const snapshot = await getDocs(collection(db, 'businessPartners'))
  const partners = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }))
  const root = resolvePartnerInIndex(new Map(partners.map((partner) => [partner.id, partner])), partnerId)
  return root ? { root, members: partnerClusterMembers(partners, root.id) } : { root: null, members: [] }
}
