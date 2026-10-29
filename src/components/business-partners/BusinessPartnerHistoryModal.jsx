import RecordHistoryModal from '../ui/RecordHistoryModal.jsx'
import { listMasterDataHistoryPage } from '../../lib/partnerHistory.js'
import { businessPartnerHistoryRows, businessPartnerHistoryValue } from '../../lib/businessPartnerHistoryPresentation.js'

export default function BusinessPartnerHistoryModal({ partner, partnerId, onClose }) {
  return <RecordHistoryModal record={partner} recordId={partnerId} loadHistoryPage={listMasterDataHistoryPage} historyRows={businessPartnerHistoryRows} formatValue={businessPartnerHistoryValue} creationLabel="Stammdatenblatt angelegt" errorMessage="Die Stammdaten-Historie konnte nicht geladen werden." onClose={onClose} />
}
