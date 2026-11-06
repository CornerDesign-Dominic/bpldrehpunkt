import { collection, getDocs } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions, waitForAppCheckToken } from './firebase.js'
import { reportTechnicalFailure } from './diagnostics.js'

export async function listContractCostCategories() {
  try {
    const snapshot = await getDocs(collection(db, 'contractCostCategories'))
    return snapshot.docs.map((item) => ({ ...item.data(), id: item.id }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }) || a.id.localeCompare(b.id))
  } catch (error) {
    void reportTechnicalFailure({ module: 'contracts', stage: 'load', error })
    throw error
  }
}

// The caller supplies a stable mutationId and unchanged payload when retrying
// an uncertain reply. Revision checks protect concurrent settings edits.
export async function saveContractCostCategory(operation) {
  try {
    await waitForAppCheckToken()
    const result = await httpsCallable(functions, 'saveContractCostCategory')(operation)
    return result.data
  } catch (error) {
    void reportTechnicalFailure({ module: 'contracts', stage: 'save', recordId: operation.recordId, error })
    throw error
  }
}
