import RecordHistoryModal from '../ui/RecordHistoryModal.jsx'
import { listTransportOrderHistoryPage } from '../../lib/transportOrders.js'
import { transportOrderHistoryRows, transportOrderHistoryValue } from '../../lib/transportOrderHistoryPresentation.js'

export default function TransportOrderHistoryModal({ order, onClose }) {
  return <RecordHistoryModal record={order} recordId={order.id} loadHistoryPage={listTransportOrderHistoryPage} historyRows={transportOrderHistoryRows} formatValue={transportOrderHistoryValue} creationLabel="Transportauftrag angelegt" errorMessage="Die Auftragshistorie konnte nicht geladen werden." onClose={onClose} />
}
