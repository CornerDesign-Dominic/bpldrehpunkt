import { collection, doc, getDoc, getDocs, limit, orderBy, query, runTransaction, serverTimestamp, startAfter } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions, waitForAppCheckToken } from './firebase.js'
import { reportTechnicalFailure } from './diagnostics.js'

const contracts = () => collection(db, 'contracts')
export const newContractId = () => doc(contracts()).id

export async function listContracts(cursor = null) {
  try {
    const result = await getDocs(query(contracts(), orderBy('createdAt', 'desc'), ...(cursor ? [startAfter(cursor)] : []), limit(50)))
    return { entries: result.docs.map((item) => ({ ...item.data(), id: item.id })), cursor: result.size === 50 ? result.docs.at(-1) : null }
  } catch (error) {
    void reportTechnicalFailure({ module: 'contracts', stage: 'load', error })
    throw error
  }
}

export async function getContract(id) {
  try {
    const result = await getDoc(doc(contracts(), id))
    return result.exists() ? { ...result.data(), id: result.id } : null
  } catch (error) {
    void reportTechnicalFailure({ module: 'contracts', stage: 'load', recordId: id, error })
    throw error
  }
}

export async function listContractRecords(id, kind) {
  if (!['positions', 'deadlines', 'notes', 'history'].includes(kind)) throw new Error('Invalid contract record type')
  try {
    const source = collection(db, 'contracts', id, kind)
    const result = await getDocs(['notes', 'history'].includes(kind) ? query(source, orderBy('createdAt', 'desc'), limit(50)) : source)
    return result.docs.map((item) => ({ ...item.data(), id: item.id }))
  } catch (error) {
    void reportTechnicalFailure({ module: 'contracts', stage: 'load', recordId: id, error })
    throw error
  }
}

export async function mutateContract(contractId, operation) {
  try {
    await waitForAppCheckToken()
    const result = await httpsCallable(functions, 'mutateContract')({ contractId, ...operation, mutationId: operation.mutationId || crypto.randomUUID() })
    return result.data
  } catch (error) {
    void reportTechnicalFailure({ module: 'contracts', stage: operation.action.endsWith('.delete') ? 'delete' : 'save', recordId: contractId, error })
    throw error
  }
}

// Keep the ID for every retry of the same creation attempt. A committed write
// whose response was lost must open the existing contract rather than add one.
export async function createContract(id, partnerName, userId) {
  const name = partnerName.trim()
  if (!name || name.length > 240) throw new Error('Invalid contract partner')
  try {
    const target = doc(contracts(), id)
    await runTransaction(db, async (transaction) => {
      const existing = await transaction.get(target)
      if (existing.exists()) {
        if (existing.data().createdBy === userId && existing.data().partnerName === name) return
        throw new Error('Contract creation conflict')
      }
      transaction.set(target, { partnerName: name, createdBy: userId, createdAt: serverTimestamp() })
    })
    return id
  } catch (error) {
    void reportTechnicalFailure({ module: 'contracts', stage: 'save', recordId: id, error })
    throw error
  }
}
