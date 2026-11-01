import { StaticText } from '../../i18n/AutoTranslate.jsx'
import { useLanguage } from '../../i18n/useLanguage.js'
import { transportOrderStopSchedule, transportOrderWorkspaceStops } from '../../lib/transportOrderWorkspacePresentation.js'

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
  return <div className={`order-station__schedule${stop.fixedAppointment === true ? ' order-station__schedule--fixed' : ''}`}>
    <div><span className="order-station__label"><StaticText source="Termin" /></span><p className="order-station__date">{schedule.date}</p><p className="order-station__time">{schedule.time}</p></div>
    {stop.fixedAppointment === true
      ? <strong className="order-station__fixed"><StaticText source="FIX" /></strong>
      : <span className="order-station__appointment-note"><StaticText source={stop.fixedAppointment === false ? 'Kein Fixtermin' : 'Fixtermin nicht übermittelt'} /></span>}
    {stop.slotUntilTime && !stop.window?.until && <p className="order-station__unresolved-time"><StaticText source="Bis-Uhrzeit aus Quelle (Datum ungeklärt)" />: {stop.slotUntilTime}</p>}
  </div>
}

function StationCargo({ stop, number }) {
  const entries = [['Gewicht', stop.cargo?.weightKg, 'kg'], ['Kolli', stop.cargo?.packages, ''], ['Lademeter', stop.cargo?.loadingMeters, 'm']]
  const hasCargo = entries.some(([, value]) => Number.isFinite(value))
  return <section className="order-station__cargo">
    <h5><StaticText source="Ware & Mengen" /></h5>
    <dl>{entries.map(([label, value, unit]) => <div key={label}>
      <dt><StaticText source={label} /></dt>
      <dd>{Number.isFinite(value) ? <>{number(value)}{unit && <small> {unit}</small>}</> : <span className="order-station__missing"><StaticText source="Nicht übermittelt" /></span>}</dd>
    </div>)}</dl>
    {typeof stop.palletExchange === 'boolean' && <p className="order-station__pallet"><StaticText source="Palettentausch" />: <strong><StaticText source={stop.palletExchange ? 'Ja' : 'Nein'} /></strong></p>}
    {!hasCargo && <p className="order-workspace__muted"><StaticText source="Keine Warenangaben übermittelt." /></p>}
  </section>
}

export default function OrderStationList({ imported, number }) {
  const stops = transportOrderWorkspaceStops(imported)
  if (!stops.length) return <p className="order-workspace__muted"><StaticText source="Keine Stationen übermittelt." /></p>
  return <div className="order-station-list">{stops.map((stop, index) => <article className="order-station" key={`${stop.sourceId || index}-${index}`}>
    <h4 className="order-station__heading"><span className="order-station__number">{stop.sequence ?? index + 1}</span><StaticText source={stop.type === 'loading' ? 'Ladestelle' : stop.type === 'unloading' ? 'Entladestelle' : 'Unbekannte Station'} /></h4>
    <div className="order-station__columns">
      <div className="order-station__place"><StationAddress stop={stop} /><StationSchedule stop={stop} /></div>
      <div className="order-station__goods">
        <StationCargo stop={stop} number={number} />
        {stop.note && <section className="order-station__instructions"><h5><StaticText source={stop.type === 'loading' ? 'Hinweise zur Abholung' : stop.type === 'unloading' ? 'Hinweise zur Zustellung' : 'Hinweise zur Station'} /></h5><p>{stop.note}</p></section>}
        {(stop.deliveryInformation || stop.deliveryNoteNumber) && <dl className="order-station__references">
          {stop.deliveryInformation && <div><dt><StaticText source="Referenz" /></dt><dd>{stop.deliveryInformation}</dd></div>}
          {stop.deliveryNoteNumber && <div><dt><StaticText source="Lieferscheinnummer" /></dt><dd>{stop.deliveryNoteNumber}</dd></div>}
        </dl>}
      </div>
    </div>
  </article>)}</div>
}
