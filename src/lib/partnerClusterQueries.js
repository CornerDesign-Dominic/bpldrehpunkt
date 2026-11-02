import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from './firebase.js'
import { loadPartnerCluster } from './partnerClusterLoader.js'

export async function getPartnerCluster(partnerId) {
  return loadPartnerCluster(partnerId, {
    readPartner: async (id) => {
      const snapshot = await getDoc(doc(db, 'businessPartners', id))
      return snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } : null
    },
    readChildren: async (ids) => {
      const batches = []
      for (let start = 0; start < ids.length; start += 30) batches.push(ids.slice(start, start + 30))
      const snapshots = await Promise.all(batches.map((batch) => getDocs(query(collection(db, 'businessPartners'), where('mergedIntoPartnerId', 'in', batch)))))
      return snapshots.flatMap((snapshot) => snapshot.docs.map((entry) => ({ ...entry.data(), id: entry.id })))
    },
  })
}
