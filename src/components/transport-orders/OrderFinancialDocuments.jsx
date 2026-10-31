import { StaticText } from '../../i18n/AutoTranslate.jsx'
import { useLanguage } from '../../i18n/useLanguage.js'
import { orderFinancialDocumentGroups, orderFinancialDocumentOriginal } from '../../lib/orderFinancialDocuments.js'
import { formatTransportOrderDocumentDate, transportOrderFinancialDocumentLabels } from '../../lib/transportOrderPresentation.js'

function DocumentWarnings({ codes = [] }) {
  const labels = {
    DOCUMENT_SOURCE_CONFLICT: 'Widersprüchliche Belegangaben – Zuordnung prüfen.',
    DOCUMENT_TYPE_UNCONFIRMED: 'Belegart noch nicht eindeutig zugeordnet.',
    DOCUMENT_NUMBER_CONFLICT: 'Abweichende externe Belegnummern – keine Nummer ausgewählt.',
    DOCUMENT_CANCELLATION_UNCONFIRMED: 'Stornobezug noch nicht eindeutig bestätigt.',
    DOCUMENT_DATE_UNCONFIRMED: 'Belegdatum nicht eindeutig bestätigt.',
  }
  return [...new Set(codes)].map(code => <p className="order-financial-documents__warning" key={code}><StaticText source={Object.hasOwn(labels, code) ? labels[code] : 'Belegangaben prüfen.'} /></p>)
}

export default function OrderFinancialDocuments({ financial, customerName, carrierName }) {
  const { language } = useLanguage()
  const w = (de, en) => language === 'en' ? en : de
  const documents = Array.isArray(financial?.documents) ? financial.documents : []
  const groups = orderFinancialDocumentGroups(documents)
  const date = value => formatTransportOrderDocumentDate(value, language)
  if (!documents.length) return <section className="transport-order-detail-section">
    <h3>{w('Abrechnungsbelege', 'Billing documents')}</h3>
    <p>{w('Noch keine Abrechnungsbelege übermittelt.', 'No billing documents have been provided yet.')}</p>
    <p className="order-workspace__muted">{w('Über „Auftragsdaten aktualisieren“ lassen sich neue Belege aus DyCoS abrufen.', 'Use “Update order data” to retrieve new documents from DyCoS.')}</p>
  </section>
  const titles = { customer: w('Kunde (KU) · Abrechnungsbelege', 'Customer · Billing documents'), carrier: w('Unternehmer (UTN) · Abrechnungsbelege', 'Carrier · Billing documents'), unknown: w('Belege mit offener Zuordnung', 'Documents awaiting classification') }
  return groups.filter(group => group.side !== 'unknown' || group.entries.length).map(group => <section className="transport-order-detail-section order-financial-documents" key={group.side}>
    <h3 id={`order-billing-${group.side}`}>{titles[group.side]}</h3>
    {(group.side === 'customer' ? customerName : group.side === 'carrier' ? carrierName : null) && <p className="order-financial-documents__partner">{group.side === 'customer' ? w('Kunde im Auftrag', 'Customer on the order') : w('Unternehmer im Auftrag', 'Carrier on the order')}: {group.side === 'customer' ? customerName : carrierName}</p>}
    {!group.entries.length ? <p>{w('Für diesen Geschäftspartner wurden keine Belege übermittelt.', 'No documents have been provided for this business partner.')}</p> : <table className="data-table order-financial-documents__table" aria-labelledby={`order-billing-${group.side}`}>
      <thead><tr>{[w('Beleg', 'Document'), w('Interne Nummer', 'Internal number'), w('Externe Nummer', 'External number'), w('Datum (intern)', 'Date (internal)')].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
      {group.entries.map(({ document, anchor }) => {
        const labels = transportOrderFinancialDocumentLabels(document)
        const original = orderFinancialDocumentOriginal(document, groups)
        const hasNotes = Boolean(document.proforma === true || document.cancelled === true || document.originalDocumentNumber || document.originalDocumentSourceId || document.cancellationReference || document.warningCodes?.length)
        return <tbody key={anchor} id={anchor}>
          <tr>
            <td><strong><StaticText source={labels.business} /></strong>{document.cancelled === true && <div className="order-financial-documents__cancelled">{w('Storniert', 'Cancelled')}</div>}<div className="order-workspace__muted"><StaticText source="Interner Beleg" />: <StaticText source={labels.internal} /></div>{labels.issuer && <div className="order-workspace__muted"><StaticText source={labels.issuer} /></div>}</td>
            <td className="order-financial-documents__number">{document.internalNumber || '—'}</td>
            <td className="order-financial-documents__number">{document.externalNumber || '—'}</td>
            <td>{date(document.date)}</td>
          </tr>
          {hasNotes && <tr><td colSpan={4} className="order-financial-documents__notes">
            {document.proforma === true && <p>{w('Proforma: interne Verbuchung; das Datum gehört zum internen Beleg.', 'Pro forma: internal booking; the date belongs to the internal document.')}</p>}
            {document.cancelled === true && document.cancellationDate && <p><StaticText source="Stornodatum" />: {date(document.cancellationDate)}</p>}
            {(document.originalDocumentNumber || original) && <p><StaticText source="Ursprungsrechnung" />: {original ? <a href={`#${original.anchor}`}>{document.originalDocumentNumber || original.document.internalNumber || '—'}</a> : document.originalDocumentNumber}</p>}
            {document.originalDocumentSourceId && !original && !document.originalDocumentNumber && <p>{w('Ursprungsbeleg nicht übermittelt.', 'Original document not provided.')}</p>}
            {document.cancellationReference && <p><StaticText source="Stornoreferenz" />: {document.cancellationReference}</p>}
            <DocumentWarnings codes={document.warningCodes} />
          </td></tr>}
        </tbody>
      })}
    </table>}
  </section>)
}
