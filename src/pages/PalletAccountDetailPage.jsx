import { useParams } from 'react-router-dom'
import PalletAccountDetail from '../components/pallets/PalletAccountDetail.jsx'

export default function PalletAccountDetailPage() {
  const { partnerId } = useParams()
  return <PalletAccountDetail partnerId={partnerId} />
}
