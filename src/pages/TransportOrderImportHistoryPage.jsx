import BackLink from '../components/ui/BackLink.jsx'
import TransportOrderImportHistory from '../components/imports/TransportOrderImportHistory.jsx'

export default function TransportOrderImportHistoryPage() {
  return <div className="import-page customer-import-page"><div className="import-page__navigation"><BackLink to="/admin" /></div><TransportOrderImportHistory scope="all" /></div>
}
