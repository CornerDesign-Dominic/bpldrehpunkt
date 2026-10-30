import { Link } from 'react-router-dom'
import { useLanguage } from '../../i18n/useLanguage.js'
import '../../styles/invoiceReview.css'

export function InvoiceReviewStatus({ status }) {
  const { language } = useLanguage()
  const label = status === 'match' ? ['Übereinstimmung', 'Match'] : status === 'mismatch' ? ['Abweichung', 'Mismatch'] : status === 'unassigned' ? ['Keine Zuordnung', 'Unassigned'] : ['Nicht vollständig prüfbar', 'Incomplete review']
  return <span className={`invoice-review-status invoice-review-status--${status}`}><span aria-hidden="true">{status === 'match' ? '✓' : status === 'mismatch' ? '✕' : '?'}</span> {label[language === 'en' ? 1 : 0]}</span>
}
function Checks({ checks, currency }) {
  const { language } = useLanguage()
  const labels = { ocr: 'OCR readability', net: 'Net amount', currency: 'Currency', issuer: 'Invoice issuer / carrier', recipient: 'Invoice recipient', issuerVatId: 'Carrier VAT ID', recipientVatId: 'Recipient VAT ID', loadingDate: 'Loading date', unloadingDate: 'Unloading date', loadingCity: 'Loading city', unloadingCity: 'Unloading city', licensePlate: 'Licence plate', positionSum: 'Item sum / invoice net', taxSum: 'Net + tax / gross', number: 'Invoice number present', date: 'Invoice date present', lookup: 'Missing data from DyCoS' }
  const value = (item, data) => data === null || data === undefined || data === '' ? '—' : ['net', 'positionSum', 'taxSum'].includes(item.key) ? (/^[A-Z]{3}$/.test(currency || '') ? new Intl.NumberFormat(language === 'en' ? 'en-GB' : 'de-DE', { style: 'currency', currency }).format(data / 100) : `${new Intl.NumberFormat(language === 'en' ? 'en-GB' : 'de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(data / 100)} (${language === 'en' ? 'currency unknown' : 'Währung offen'})`) : String(data)
  return <div className="invoice-review-comparison"><table><thead><tr><th>{language === 'en' ? 'Check' : 'Prüfpunkt'}</th><th>{language === 'en' ? 'Invoice' : 'Rechnung'}</th><th>{language === 'en' ? 'Reference' : 'Vergleichswert'}</th><th>{language === 'en' ? 'Result' : 'Ergebnis'}</th></tr></thead><tbody>{checks.map(check => <tr key={check.key}><th scope="row">{language === 'en' ? labels[check.key.split('-')[0]] || check.label : check.label.replace(' (Cent)', '')}</th><td>{value(check, check.actual)}</td><td>{value(check, check.expected)}</td><td><InvoiceReviewStatus status={check.status} /></td></tr>)}</tbody></table></div>
}
export default function InvoiceReviewResults({ report }) {
  const { language } = useLanguage()
  const w = (de,en) => language === 'en' ? en : de
  return <div className="invoice-review-results"><div className="invoice-review-summary"><strong>{w('Gesamtprüfung', 'Overall review')}</strong><InvoiceReviewStatus status={report.status} /><small>{w('Prüfstand', 'Reviewed at')}: {new Date(report.createdAt).toLocaleString(language === 'en' ? 'en-GB' : 'de-DE', {timeZone:'Europe/Berlin'})}</small></div>
    {report.message && <p role="status">{report.message}</p>}
    {report.invoices.map((invoice,index) => <section className="invoice-review-invoice" key={index}><h3>{w('Rechnung', 'Invoice')} {invoice.number || '—'}</h3><p className="mailbox-hint">{invoice.issuer} · {invoice.fileName} · {invoice.currency}</p><InvoiceReviewStatus status={invoice.status} />{invoice.ocrPages?.length > 0 && <p className="mailbox-hint">{w('Scan per OCR gelesen · Seiten', 'Scan read using OCR · pages')}: {invoice.ocrPages.join(', ')}{invoice.ocrUncertainPages?.length > 0 && <strong className="invoice-review-warning"> · {w('Unsichere Stellen – Original prüfen', 'Uncertain text – check original')}</strong>}</p>}
      {invoice.warnings.length > 0 && <ul className="invoice-review-warning">{invoice.warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul>}
      <details><summary>{w('Rechnungssummen und Kopfdaten', 'Invoice totals and header')}</summary><Checks checks={invoice.totals.checks} currency={invoice.currency} /></details>
      {invoice.transports.map((transport,i)=><details className="invoice-review-transport" key={`${transport.ta}-${i}`} open={transport.status !== 'match'}><summary><span className="invoice-review-transport-name"><span className="invoice-review-expander" aria-hidden="true" /><strong>{transport.ta ? `TA ${transport.ta}` : w('Position ohne TA-Nummer', 'Item without TA number')}</strong></span><InvoiceReviewStatus status={transport.status} /></summary>
        {transport.message && <p>{transport.message}</p>}{transport.source && <p className="mailbox-hint">{w('Verglichen mit', 'Compared with')}: {transport.source}</p>}
        {transport.orderId && (transport.localExists ? <Link to={`/transportauftraege/${transport.orderId}`}>{w('Transport öffnen', 'Open transport')}</Link> : <p className="invoice-review-warning">{w('TA aus DyCoS gelesen. Nach dem regulären Import ist dieser Prüfbericht im Auftrag verfügbar.', 'Order read from DyCoS. This report becomes available on the order after its regular import.')}</p>)}
        {transport.checks.length > 0 && <Checks checks={transport.checks} currency={invoice.currency} />}
        {transport.evidence?.length > 0 && <details><summary>{w('Belege aus der Rechnung', 'Invoice evidence')}</summary>{transport.evidence.map((evidence,j)=><blockquote key={j}>{evidence.ta}<br />{evidence.net}</blockquote>)}</details>}
      </details>)}
    </section>)}
    <p className="mailbox-hint">{w('Gespeicherte Momentaufnahme. Grün gilt nur für die aufgeführten Prüfungen. Keine Zahlungsfreigabe; Steuerrecht, Bankverbindung und Ablieferbelege sind nicht geprüft.', 'Saved snapshot. Green applies only to the listed checks. This is not payment approval; tax law, bank details and delivery documents are not checked.')}</p>
  </div>
}
