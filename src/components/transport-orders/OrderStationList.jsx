import { StaticText } from '../../i18n/AutoTranslate.jsx'
import { useLanguage } from '../../i18n/useLanguage.js'
import { transportOrderStopSchedule, transportOrderWorkspaceStops } from '../../lib/transportOrderWorkspacePresentation.js'
import { orderStationAddressAttention } from '../../lib/orderStationAttention.js'

function StationCard({ title, attention = false, className = '', children }) {
  return <section className={`order-station__card${attention ? ' order-station__card--attention' : ''} ${className}`}>
    <h5><StaticText source={title} /></h5>{children}
  </section>
}

function StationAddress({ stop }) {
  const address = stop.address || {}
  const lines = [
    [address.street, address.houseNumber].filter(Boolean).join(' '),
    [address.postalCode, address.city].filter(Boolean).join(' '),
    address.country,
  ].filter(Boolean)
  if (stop.legacy) return <address className="order-station__address">{stop.originalText || stop.city || <StaticText source="Keine Adresse übermittelt." />}</address>
  if (!address.company && !lines.length) return <p className="order-workspace__muted"><StaticText source="Keine Adresse übermittelt." /></p>
  return <address className="order-station__address">
    {address.company && <strong>{address.company}</strong>}
    {lines.map((line, index) => <span key={index}>{line}</span>)}
  </address>
}

function StationSchedule({ stop }) {
  const { language } = useLanguage()
  const schedule = transportOrderStopSchedule(stop, language)
  return <StationCard title="Termin" attention={stop.fixedAppointment === true} className="order-station__schedule">
    <div className="order-station__appointment"><p className="order-station__date">{schedule.date}</p><p className="order-station__time">{schedule.time}{stop.fixedAppointment === true && <>{' - '}<span className="order-station__fix-label">FIX</span></>}</p></div>
    {stop.slotUntilTime && !stop.window?.until && <p className="order-station__unresolved-time"><StaticText source="Bis-Uhrzeit aus Quelle (Datum ungeklärt)" />: {stop.slotUntilTime}</p>}
  </StationCard>
}

function StationCargo({ stop, number }) {
  const entries = [['Gewicht', stop.cargo?.weightKg, 'kg'], ['Kolli', stop.cargo?.packages, ''], ['Lademeter', stop.cargo?.loadingMeters, 'm']]
  const hasCargo = entries.some(([, value]) => Number.isFinite(value))
  return <StationCard title="Ware & Mengen" className="order-station__cargo">
    {stop.cargo?.description && <p className="order-station__description">{stop.cargo.description}</p>}
    <dl>{entries.map(([label, value, unit]) => <div key={label}>
      <dt><StaticText source={label} /></dt>
      <dd>{Number.isFinite(value) ? <>{number(value)}{unit && <small> {unit}</small>}</> : <span className="order-station__missing"><StaticText source="Nicht übermittelt" /></span>}</dd>
    </div>)}</dl>
    {Number.isFinite(stop.cargo?.volumetricWeightKg) && <div className="order-station__volume-weight"><p><StaticText source="Volumengewicht (DyCoS)" />: <strong>{number(stop.cargo.volumetricWeightKg)} kg</strong></p><p className="order-workspace__muted"><StaticText source="Zusätzlicher Quellwert; Berechnungsgrundlage nicht übermittelt." /></p></div>}
    {!hasCargo && <p className="order-workspace__muted"><StaticText source="Keine Warenangaben übermittelt." /></p>}
  </StationCard>
}

export default function OrderStationList({ imported, number }) {
  const stops = transportOrderWorkspaceStops(imported)
  if (!stops.length) return <p className="order-workspace__muted"><StaticText source="Keine Stationen übermittelt." /></p>
  return <div className="order-station-list">{stops.map((stop, index) => {
    const addressAttention = orderStationAddressAttention(stop, imported.dispositionNote)
    return <article className="order-station" key={`${stop.sourceId || index}-${index}`}>
    <div className="order-station__columns">
      <div className="order-station__place">
        <h4 className="order-station__heading">{stop.sequence ?? index + 1} · <StaticText source={stop.type === 'loading' ? 'Ladestelle' : stop.type === 'unloading' ? 'Entladestelle' : 'Unbekannte Station'} /></h4>
        <StationCard title="Adresse" attention={Boolean(addressAttention)} className="order-station__address-field">
          {addressAttention && <p className="order-station__attention-note"><StaticText source={addressAttention} /></p>}
          <StationAddress stop={stop} />
        </StationCard>
        <StationSchedule stop={stop} />
        <StationCard title="Referenz" className="order-station__reference"><p>{stop.deliveryInformation || <span className="order-workspace__muted"><StaticText source="Nicht übermittelt" /></span>}</p></StationCard>
      </div>
      <div className="order-station__goods">
        <h4 className="order-station__heading"><StaticText source={stop.type === 'loading' ? 'Ladehinweise & Ware' : stop.type === 'unloading' ? 'Entladehinweise & Ware' : 'Stationshinweise & Ware'} /></h4>
        <StationCard title="Bemerkung" className="order-station__instructions"><p>{stop.note || <span className="order-workspace__muted"><StaticText source="Keine Bemerkung übermittelt." /></span>}</p></StationCard>
        <StationCargo stop={stop} number={number} />
        <StationCard title="Palettentausch" attention={stop.palletExchange === true} className="order-station__pallet"><p className="order-station__pallet-value"><StaticText source={stop.palletExchange === true ? 'Ja' : stop.palletExchange === false ? 'Nein' : 'Nicht übermittelt'} /></p></StationCard>
        {stop.deliveryNoteNumber && <StationCard title="Lieferscheinnummer"><p>{stop.deliveryNoteNumber}</p></StationCard>}
      </div>
    </div>
  </article>})}</div>
}
