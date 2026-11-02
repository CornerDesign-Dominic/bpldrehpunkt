import { collection, documentId, getDocs, query, where } from 'firebase/firestore'
import { db } from './firebase.js'
import { getPartnerCluster } from './partnerClusterQueries.js'
import { reportTechnicalFailure } from './diagnostics.js'
import { listTodosForActor } from './todos.js'
import { collectRelatedRecordResults, filterPartnerTodos, partnerRelatedRecordPlan } from './partnerRelatedRecordPlan.js'

export async function listPartnerRelatedRecords(partnerId, allowedModules, actor) {
  // Resolve archived members without rewriting their original case references.
  const cluster = await getPartnerCluster(partnerId)
  if (!cluster.root) throw new Error('Geschäftspartner nicht mehr verfügbar.')
  const memberIds = [cluster.root.id, ...cluster.members.map((member) => member.id)]
  const plans = partnerRelatedRecordPlan(memberIds, allowedModules)
  return Promise.all(plans.map(async (plan) => {
    const requests = plan.type === 'todo' ? [Promise.resolve().then(async () => {
      if (!actor?.user?.uid) throw new Error('Benutzer für To-do-Zugriff fehlt.')
      return filterPartnerTodos(await listTodosForActor(actor), memberIds)
    })] : plan.queries.map(async ({ field, ids }) => {
      const snapshot = await getDocs(query(collection(db, plan.collection), where(field === '__name__' ? documentId() : field, 'in', ids)))
      return snapshot.docs.map((entry) => ({ ...entry.data(), id: entry.id }))
    })
    const results = await Promise.allSettled(requests)
    const { records, failedQueries } = collectRelatedRecordResults(results, plan.type)
    if (failedQueries) void reportTechnicalFailure({ module: 'partner-links', stage: 'load', recordId: partnerId, error: results.find((result) => result.status === 'rejected').reason })
    return { module: plan.module, type: plan.type, label: plan.label, records, failedQueries }
  }))
}
