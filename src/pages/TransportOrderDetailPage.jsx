import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getTransportOrder } from '../lib/transportOrders.js'
import { isCarrierMasterDataIncomplete } from '../lib/importedPartnerStatus.js'
import { businessPartnerDetailPath } from '../lib/businessPartnerLinks.js'
import { transportOrderDocumentTitle } from '../lib/transportOrderPresentation.js'
import { CopyIcon } from '../components/icons.jsx'
import { getEffectiveBusinessPartner } from '../lib/businessPartners.js'
import { usePageHeader } from '../lib/pageHeader.js'

function Detail({ label, children, emptyFallback = '—' }) { return <div><dt>{label}</dt><dd>{children || emptyFallback}</dd></div> }
async function copyToClipboard(value) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value)
  const temporaryInput = document.createElement('textarea')
  temporaryInput.value = value
  temporaryInput.setAttribute('readonly', '')
  temporaryInput.style.position = 'fixed'
  temporaryInput.style.opacity = '0'
  document.body.appendChild(temporaryInput)
  temporaryInput.select()
  document.execCommand('copy')
  temporaryInput.remove()
}
function CopyDetail({ label, value }) {
  const [copied, setCopied] = useState(false)
  const displayValue = value || '—'
  async function copyValue() {
    try {
      await copyToClipboard(displayValue)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }
  return <div><dt>{label}</dt><dd className="transport-order-copy-detail__value"><span>{displayValue}</span>{displayValue !== '—' && <button type="button" className="transport-order-copy-detail__button" onClick={copyValue} title={copied ? 'Kopiert' : `${label} kopieren`} aria-label={copied ? `${label} kopiert` : `${label} kopieren`}><CopyIcon size={14} /></button>}</dd></div>
}
function formatNumber(value, suffix = '') { return typeof value === 'number' ? new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(value) + suffix : '—' }
function formatCurrency(value) { return typeof value === 'number' ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value) : '—' }
function formatStationDateTime(value) {
  if (typeof value !== 'string' || !value) return '—'
  const date = new Date(`${value}:00`)
  if (Number.isNaN(date.getTime())) return '—'
  const weekdays = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
  return `${weekdays[date.getDay()]}, ${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}, ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
function formatTimestamp(value) { return value?.toDate ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(value.toDate()) : '—' }
function formatPartnerAddress(partner) {
  const address = partner?.address || {}
  return [[address.street, address.houseNumber].filter(Boolean).join(' '), [address.postalCode, address.city].filter(Boolean).join(' '), address.country].filter(Boolean).join(', ')
}
function usePartnerMasterData(partnerId) {
  const [entry, setEntry] = useState({ partnerId: '', data: null })
  useEffect(() => {
    if (!partnerId) return undefined
    let current = true
    getEffectiveBusinessPartner(partnerId).then((partner) => { if (current) setEntry({ partnerId, data: partner }) }).catch(() => { if (current) setEntry({ partnerId, data: null }) })
    return () => { current = false }
  }, [partnerId])
  return entry.partnerId === partnerId ? entry.data : null
}
function PartnerLink({ partner, effectivePartner, warning }) {
  const name = effectivePartner?.companyName || partner?.partnerName || partner?.originalName || partner?.name
  if (!partner?.partnerId) return name || '—'
  return <span className="transport-order-partner-link"><Link to={businessPartnerDetailPath(effectivePartner?.id || partner.partnerId)}>{name}</Link>{warning && <span className="transport-order-partner-link__warning" role="img" aria-label="Unternehmer-Stammdaten unvollständig – Kreditorennummer fehlt." title="Unternehmer-Stammdaten unvollständig – Kreditorennummer fehlt.">!</span>}</span>
}

export default function TransportOrderDetailPage() {
  const { transportOrderId } = useParams()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { setTitle } = usePageHeader()
  useEffect(() => { getTransportOrder(transportOrderId).then((entry) => { setOrder(entry); if (!entry) setError('Transportauftrag nicht gefunden.') }).catch(() => setError('Der Transportauftrag konnte nicht geladen werden.')).finally(() => setLoading(false)) }, [transportOrderId])
  const customerMasterData = usePartnerMasterData(order?.imported?.customer?.partnerId)
  const carrierMasterData = usePartnerMasterData(order?.imported?.carrier?.partnerId)
  useEffect(() => {
    document.title = transportOrderDocumentTitle(order?.externalNumber)
    return () => { document.title = 'Drehpunkt' }
  }, [order?.externalNumber])
  useEffect(() => {
    setTitle(order?.externalNumber ? `TA ${order.externalNumber}` : '')
    return () => setTitle('')
  }, [order?.externalNumber, setTitle])
  const imported = order?.imported
  if (loading) return <div className="transport-order-detail-page"><p className="page-state">Transportauftrag wird geladen …</p></div>
  if (error || !imported) return <div className="transport-order-detail-page"><section className="todo-detail-empty"><h2>Transportauftrag nicht verfügbar</h2><p>{error || 'Noch keine Daten verfügbar.'}</p></section></div>
  return <div className="transport-order-detail-page">
    <div className="transport-order-detail-layout">
      <aside className="transport-order-detail-actions" aria-label="Verknüpfungen">
        <section className="transport-order-detail-section"><h3>Verknüpfungen</h3><div className="transport-order-detail-actions__buttons"><button type="button" className="button button--secondary" disabled>To-do hinzufügen</button><button type="button" className="button button--secondary" disabled>Schadenfall anlegen</button><button type="button" className="button button--secondary" disabled>Haftbarhaltung an Unternehmer</button></div><p>Wird mit dem nächsten Ausbauschritt aktiviert.</p></section>
        <section className="transport-order-detail-section"><h3>Bewertung</h3><div className="transport-order-detail-actions__buttons"><button type="button" className="button button--secondary" disabled>Bewertung KU</button><button type="button" className="button button--secondary" disabled>Bewertung UTN</button></div></section>
      </aside>
      <main className="transport-order-detail-main">
        <section className="transport-order-detail-section transport-order-detail-section--transport-wide transport-order-detail-section--general"><div className="transport-order-detail-general-row transport-order-detail-general-row--order"><h4>Auftrag &amp; Preise</h4><dl className="transport-order-detail-list"><CopyDetail label="TA-Nummer" value={order.externalNumber} /><Detail label="Mitarbeiterrelation">{imported.relation}</Detail><CopyDetail label="Kundenreferenz" value={imported.customerReference} /><Detail label="Ertrag netto">{formatCurrency(imported.financial?.revenueNet)}</Detail><Detail label="Kosten netto">{formatCurrency(imported.financial?.costNet)}</Detail></dl></div><div className="transport-order-detail-general-row transport-order-detail-general-row--vehicle-cargo"><h4>Fahrzeug &amp; Ware</h4><dl className="transport-order-detail-list"><Detail label="Fahrzeugart">{imported.shipment?.vehicleType}</Detail><CopyDetail label="Kennzeichen" value={imported.shipment?.licensePlate} /><Detail label="Kolli">{formatNumber(imported.shipment?.packages)}</Detail><Detail label="Gewicht">{formatNumber(imported.shipment?.weightKg, ' kg')}</Detail><Detail label="Lademeter">{formatNumber(imported.shipment?.loadingMeters)}</Detail></dl></div></section>
        <section className="transport-order-detail-section"><h3>Kunde</h3><dl className="transport-order-detail-list"><Detail label="Frachtzahler"><PartnerLink partner={imported.customer} effectivePartner={customerMasterData} /></Detail><Detail label="Debitorennummer">{imported.customer?.debtorNumber}</Detail><Detail label="Adresse" emptyFallback="">{formatPartnerAddress(customerMasterData)}</Detail></dl></section>
        <section className="transport-order-detail-section"><h3>Unternehmer</h3><dl className="transport-order-detail-list"><Detail label="Unternehmer"><PartnerLink partner={imported.carrier} effectivePartner={carrierMasterData} warning={isCarrierMasterDataIncomplete(imported.carrier)} /></Detail><Detail label="Kreditorennummer">{carrierMasterData?.creditorNumber || imported.carrier?.creditorNumber}</Detail><Detail label="Adresse" emptyFallback="">{formatPartnerAddress(carrierMasterData)}</Detail><Detail label="TA versendet an">{imported.dispatch?.sentTo}</Detail></dl></section>
        <section className="transport-order-detail-section transport-order-detail-section--after-partners"><h3>Erste Ladestelle</h3><dl className="transport-order-detail-list"><CopyDetail label="Adresse" value={imported.loading?.originalText} /><CopyDetail label="Ort" value={imported.loading?.city} /><Detail label="Von">{formatStationDateTime(imported.loading?.window?.from)}</Detail><Detail label="Bis">{formatStationDateTime(imported.loading?.window?.until)}</Detail></dl></section>
        <section className="transport-order-detail-section transport-order-detail-section--after-partners"><h3>Ladehinweise</h3><dl className="transport-order-detail-list"><Detail label="Bemerkung">{imported.loading?.note}</Detail><CopyDetail label="Referenz" value={imported.loading?.reference} /></dl></section>
        <section className="transport-order-detail-section"><h3>Letzte Entladestelle</h3><dl className="transport-order-detail-list"><CopyDetail label="Adresse" value={imported.unloading?.originalText} /><CopyDetail label="Ort" value={imported.unloading?.city} /><Detail label="Von">{formatStationDateTime(imported.unloading?.window?.from)}</Detail><Detail label="Bis">{formatStationDateTime(imported.unloading?.window?.until)}</Detail></dl></section>
        <section className="transport-order-detail-section"><h3>Entladehinweise</h3><dl className="transport-order-detail-list"><Detail label="Bemerkung">{imported.unloading?.note}</Detail><CopyDetail label="Referenz" value={imported.unloading?.reference} /></dl></section>
      </main>
      <aside className="transport-order-detail-system" aria-label="System und Kontext">
        <section className="transport-order-detail-section"><h3>Hinweise</h3><p>Sendungsverfolgung noch nicht ermittelt. DyCoS liefert hierfür keine Statusdaten.</p></section>
        <section className="transport-order-detail-section transport-order-detail-section--contacts"><h3>Kontakte</h3><div className="transport-order-detail-contact-group"><h4>Kunde</h4><dl className="transport-order-detail-list transport-order-detail-list--single"><CopyDetail label="Standard" value={imported.contacts?.customerStandardEmail} /><CopyDetail label="Info-1" value={imported.contacts?.customerForOrder} /></dl></div><div className="transport-order-detail-contact-group"><h4>Unternehmer</h4><dl className="transport-order-detail-list transport-order-detail-list--single"><CopyDetail label="Standard" value={imported.contacts?.carrierStandardEmail} /><CopyDetail label="Im Auftrag" value={imported.contacts?.carrierForOrder} /></dl></div></section>
        <section className="transport-order-detail-section transport-order-detail-section--import-info"><h3>Importinfos</h3><dl className="transport-order-detail-list transport-order-detail-list--single"><Detail label="Importiert am">{formatTimestamp(order.importMeta?.importedAt)}</Detail><Detail label="Zuletzt aktualisiert">{formatTimestamp(order.updatedAt || order.importMeta?.lastImportedAt)}</Detail></dl><details className="transport-order-detail-import-info"><summary>Weitere Importinfos</summary><dl className="transport-order-detail-list transport-order-detail-list--single"><Detail label="Importdatei">{order.importMeta?.fileName}</Detail><Detail label="Importlauf">{order.importMeta?.importRunId}</Detail></dl></details></section>
      </aside>
    </div>
  </div>
}
