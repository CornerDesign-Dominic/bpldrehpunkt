import { StaticText } from '../../i18n/AutoTranslate.jsx'
import { useLanguage } from '../../i18n/useLanguage.js'

const present = (value) => value !== null && value !== undefined && value !== ''

export default function TransportOrderImportedDetails({ imported }) {
  const { language } = useLanguage()
  const locale = language === 'en' ? 'en-GB' : 'de-DE'
  const number = (value) => present(value) ? new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value) : '—'
  const money = (value) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(value ?? 0)
  const financial = imported?.financial || {}
  return <>
    {[['revenuePositions', 'Einzelne Ertragspositionen'], ['costPositions', 'Einzelne Kostenpositionen']].map(([key, title]) => Array.isArray(financial[key]) && <section key={key} className="transport-order-detail-section transport-order-detail-section--transport-wide">
      <h3><StaticText source={title} /></h3>
      {financial[key].length === 0 ? <p><StaticText source="Keine Positionen übermittelt." /></p> : <div className="transport-order-imported-table"><table className="data-table"><thead><tr>
        {['Position', 'Leistung', 'Menge', 'Einheit', 'Einzelpreis netto', 'Gesamt netto'].map((label) => <th key={label}><StaticText source={label} /></th>)}
      </tr></thead><tbody>{financial[key].map((position) => <tr key={position.id}>
        <td>{number(position.sequence)}</td><td>{position.description || '—'}</td><td>{number(position.quantity)}</td><td>{position.unit || '—'}</td><td>{money(position.unitPriceNet)}</td><td>{money(position.amountNet)}</td>
      </tr>)}</tbody></table></div>}
    </section>)}
    {Array.isArray(imported?.stops) && <section className="transport-order-detail-section transport-order-detail-section--transport-wide">
      <h3><StaticText source="Warenangaben je Station" /></h3>
      {imported.stops.length === 0 ? <p><StaticText source="Keine Stationen übermittelt." /></p> : <div className="transport-order-imported-table"><table className="data-table"><thead><tr>
        {['Position', 'Station', 'Adresse', 'Gewicht (kg)', 'Kolli', 'Lademeter', 'Palettentausch'].map((label) => <th key={label}><StaticText source={label} /></th>)}
      </tr></thead><tbody>{imported.stops.map((stop) => <tr key={stop.sourceId}>
        <td>{number(stop.sequence)}</td><td><StaticText source={stop.type === 'loading' ? 'Ladestelle' : stop.type === 'unloading' ? 'Entladestelle' : 'Unbekannt'} /></td>
        <td>{[stop.address?.company, stop.address?.street, [stop.address?.country, stop.address?.postalCode, stop.address?.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '—'}</td>
        <td>{number(stop.cargo?.weightKg)}</td><td>{number(stop.cargo?.packages)}</td><td>{number(stop.cargo?.loadingMeters)}</td><td>{typeof stop.palletExchange === 'boolean' ? <StaticText source={stop.palletExchange ? 'Ja' : 'Nein'} /> : '—'}</td>
      </tr>)}</tbody></table></div>}
      <p><StaticText source="Stationsmengen werden nicht addiert. Palettentausch ist eine Quellenangabe und erzeugt keine Palettenbuchung." /></p>
    </section>}
  </>
}
