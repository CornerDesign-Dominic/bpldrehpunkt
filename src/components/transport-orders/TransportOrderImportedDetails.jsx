import { StaticText } from '../../i18n/AutoTranslate.jsx'
import { useLanguage } from '../../i18n/useLanguage.js'
import { formatTransportOrderDocumentDate, transportOrderFinancialDocumentLabels } from '../../lib/transportOrderPresentation.js'

const present = (value) => value !== null && value !== undefined && value !== ''

export default function TransportOrderImportedDetails({ imported }) {
  const { language } = useLanguage()
  const locale = language === 'en' ? 'en-GB' : 'de-DE'
  const number = (value) => present(value) ? new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value) : '—'
  const money = (value) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(value ?? 0)
  const financial = imported?.financial || {}
  return <>
    {Array.isArray(financial.documents) && <section className="transport-order-detail-section transport-order-detail-section--transport-wide">
      <h3><StaticText source="Rechnungen und Gutschriften" /></h3>
      {financial.documents.length === 0 ? <p><StaticText source="Keine Belege übermittelt." /></p> : <div className="transport-order-imported-table"><table className="data-table"><thead><tr>
        {['Belegart', 'Interne Belegnummer', 'Externe Belegnummer', 'Datum interner Beleg', 'Währung', 'Hinweise'].map(label => <th key={label}><StaticText source={label} /></th>)}
      </tr></thead><tbody>{financial.documents.map(document => {
        const labels = transportOrderFinancialDocumentLabels(document)
        const original = document.originalDocumentSourceId && financial.documents.find(candidate => candidate.sourceId === document.originalDocumentSourceId)
        return <tr key={document.id} id={document.sourceId ? `transport-order-document-${document.sourceId}` : undefined}>
          <td><StaticText source={labels.business} /><div><StaticText source="Interner Beleg" />: <StaticText source={labels.internal} /></div>{labels.issuer && <div><StaticText source={labels.issuer} /></div>}</td>
          <td>{document.internalNumber || '—'}</td><td>{document.externalNumber || '—'}</td><td>{formatTransportOrderDocumentDate(document.date, language)}</td><td>{document.currency === 'EUR' ? 'EUR' : '—'}</td>
          <td>{document.proforma === true && <div><StaticText source="Proforma: interne Verbuchung" /></div>}{document.cancelled === true && <div><StaticText source="Beleg storniert" />{document.cancellationDate && <> · {formatTransportOrderDocumentDate(document.cancellationDate, language)}</>}</div>}{document.originalDocumentNumber && <div><StaticText source="Ursprungsrechnung" />: {original ? <a style={{ color: 'inherit' }} href={`#transport-order-document-${original.sourceId}`}>{document.originalDocumentNumber}</a> : document.originalDocumentNumber}</div>}{document.cancellationReference && <div><StaticText source="Stornoreferenz" />: {document.cancellationReference}</div>}{document.warningCodes?.length > 0 && <div><StaticText source="Belegangaben prüfen." /></div>}</td>
        </tr>
      })}</tbody></table></div>}
    </section>}
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
