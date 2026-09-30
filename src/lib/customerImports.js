import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase.js'

const call = async (name, data) => (await httpsCallable(functions, name)(data)).data

export const processCustomerImport = ({ fileName, rows }) => call('processCustomerImport', { fileName, rows })
export const listCustomerImportQueue = (runId) => call('listCustomerImportQueue', { runId })
export const claimCustomerImportRow = ({ runId, rowId }) => call('claimCustomerImportRow', { runId, rowId })
export const releaseCustomerImportRow = (rowId) => call('releaseCustomerImportRow', { rowId })
export const approveCustomerImportRow = ({ runId, rowId, approvedValues }) => call('approveCustomerImportRow', { runId, rowId, approvedValues })
export const mergeCustomerImportPartners = ({ runId, rowId, targetPartnerId, decisions, partnerVersions }) => call('mergeCustomerImportPartners', { runId, rowId, targetPartnerId, decisions, partnerVersions })

// Legacy exports remain available for code that has not yet switched to the queue workflow.
export const previewCustomerImport = (rows) => call('previewCustomerImport', { rows })
export const importCustomerRows = ({ fileName, rows, rowErrors }) => call('importCustomers', { fileName, rows, rowErrors })
