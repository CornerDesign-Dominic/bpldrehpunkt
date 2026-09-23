import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase.js'

const call = async (name, data) => (await httpsCallable(functions, name)(data)).data
export const processCarrierImport = ({ fileName, rows }) => call('processCarrierImport', { fileName, rows })
export const listCarrierImportQueue = (runId) => call('listCarrierImportQueue', { runId })
export const claimCarrierImportRow = ({ runId, rowId }) => call('claimCarrierImportRow', { runId, rowId })
export const releaseCarrierImportRow = (rowId) => call('releaseCarrierImportRow', { rowId })
export const approveCarrierImportRow = ({ runId, rowId, approvedValues }) => call('approveCarrierImportRow', { runId, rowId, approvedValues })
export const mergeCarrierImportPartners = ({ runId, rowId, targetPartnerId, decisions, partnerVersions }) => call('mergeCarrierImportPartners', { runId, rowId, targetPartnerId, decisions, partnerVersions })
