import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listBusinessPartners } from '../../lib/businessPartners.js'
import { palletAccountPath } from '../../lib/businessPartnerLinks.js'
import { listAllPalletMovements } from '../../lib/palletAccounts.js'
import { formatPalletDate } from '../pallets/palletFormatters.js'

const text = (value) => typeof value === 'string' ? value.trim() : ''
const sameNumber = (left, right) => text(left).toLocaleLowerCase('de-DE') === text(right).toLocaleLowerCase('de-DE')

export default function TransportOrderPalletMovementsCard({ transportNumber }) {
  const navigate = useNavigate()
  const [movements, setMovements] = useState([])
  const [partners, setPartners] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let current = true
    Promise.all([listAllPalletMovements(), listBusinessPartners()]).then(([loadedMovements, loadedPartners]) => {
      if (!current) return
      setMovements(loadedMovements.filter((movement) => sameNumber(movement.tourNumber, transportNumber)))
      setPartners(loadedPartners)
    }).catch(() => { if (current) setError('Die verknüpften Palettenbewegungen konnten nicht geladen werden.') }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [transportNumber])

  const partnersById = useMemo(() => new Map(partners.map((partner) => [partner.id, partner])), [partners])
  function openMovement(movement, partnerId) {
    navigate(palletAccountPath(partnerId), { state: { palletMovementId: movement.id } })
  }
  function accountTargets(movement) {
    return [...new Set([movement.customerId, movement.carrierId].filter(Boolean))].map((partnerId) => ({ partnerId, label: partnersById.get(partnerId)?.companyName || 'Palettenkonto' }))
  }

  return <section className="transport-order-detail-section transport-order-pallet-movements"><h3>Palettenbewegungen</h3>{error && <p className="form-error">{error}</p>}{loading ? <p>Palettenbewegungen werden geladen …</p> : movements.length ? <div className="transport-order-pallet-movements__list">{movements.map((movement) => <article key={movement.id}><div><strong>{movement.palletReceiptNumber || 'Palettenbewegung'}</strong><span>{formatPalletDate(movement.date)}</span></div><div className="transport-order-detail-actions__buttons">{accountTargets(movement).map((target) => <button className="button button--secondary" type="button" key={target.partnerId} onClick={() => openMovement(movement, target.partnerId)}>{target.label} öffnen</button>)}</div></article>)}</div> : <p>Keine Palettenbewegung mit dieser Transportnummer verknüpft.</p>}</section>
}
