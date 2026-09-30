import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase.js'

const call = async (name, data) => (await httpsCallable(functions, name)(data)).data

export const prepareManualPartnerMerge = ({ currentPartnerId, otherPartnerId, direction }) => call('prepareManualPartnerMerge', { currentPartnerId, otherPartnerId, direction })
export const mergeManualPartners = ({ currentPartnerId, otherPartnerId, direction, partnerVersions, decisions }) => call('mergeManualPartners', { currentPartnerId, otherPartnerId, direction, partnerVersions, decisions })
export const previewPartnerMergeReversal = ({ mergeId, targetPartnerId }) => call('previewPartnerMergeReversal', { mergeId, targetPartnerId })
export const separatePartnerMerge = ({ mergeId, targetPartnerId, fingerprint }) => call('separatePartnerMerge', { mergeId, targetPartnerId, fingerprint })
