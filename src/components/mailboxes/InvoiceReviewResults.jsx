import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../../i18n/useLanguage.js'
import { invoiceCheckColor, invoiceDisplayChecks, invoiceReviewDistribution, invoiceTransportChecks, invoiceAmountDetails, formatInvoiceCheckValue } from '../../lib/invoiceReviewPresentation.js'
import '../../styles/invoiceReview.css'

const colorLabels = {
  green: ['Übereinstimmend', 'Matching'], yellow: ['Ungeklärt', 'Unresolved'], red: ['Abweichend', 'Different'],
  blue: ['Ergänzend', 'Additional'], gray: ['Ergänzend', 'Additional'],
}

export function InvoiceReviewStatus({ status, color }) {
  const { language } = useLanguage()
  const tone = invoiceCheckColor({ status, color })
  return <span className={`invoice-review-status invoice-review-status--${tone === 'blue' ? 'gray' : tone}`}><i className="invoice-review-dot" aria-hidden="true" />{colorLabels[tone][language === 'en' ? 1 : 0]}</span>
}

function Source({ text, label }) {
  const { language } = useLanguage()
  const [open, setOpen] = useState(false)
  const id = useId()
  if (!text) return null
  return <span className="invoice-review-source"><button type="button" className="invoice-review-source-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>{label || (language === 'en' ? 'Details' : 'Details')}</button><span id={id} className="invoice-review-source-text" hidden={!open}>{text}</span></span>
}

const labels = { ocr: 'Text recognition', net: 'Net amount', netTotal: 'Net total / orders', vat: 'VAT', vatTotal: 'VAT / reference', gross: 'Gross amount', grossTotal: 'Gross / reference', currency: 'Currency', issuer: 'Invoice issuer / carrier', recipient: 'Invoice recipient', issuerVatId: 'Carrier VAT ID', recipientVatId: 'Recipient VAT ID', recipientAddress: 'Invoice address', loadingDate: 'Loading date', unloadingDate: 'Unloading date', loadingCity: 'Loading city', unloadingCity: 'Unloading city', licensePlate: 'Licence plate', positionSum: 'Item sum / invoice net', taxSum: 'Net + tax / gross', number: 'Invoice number', date: 'Invoice date', lookup: 'DyCoS lookup', paymentDays: 'Payment term', paymentTerms: 'Payment terms', dueDate: 'Due date', foreignVat: 'Foreign-carrier VAT', billingStatus: 'Previous billing / duplicates', ta: 'Transport order', serviceDate: 'Service date', deliveryDate: 'Delivery date' }

function Checks({ checks = [], currency }) {
  const { language } = useLanguage()
  const en = language === 'en'
  if (!checks.length) return null
  return <div className="invoice-review-checks"><div className="invoice-review-column-head" aria-hidden="true"><span>{en ? 'Check' : 'Prüfpunkt'}</span><span>{en ? 'Invoice' : 'Rechnung'}</span><span>{en ? 'Reference' : 'Vergleich'}</span><span>{en ? 'Result' : 'Ergebnis'}</span></div>{checks.map((check, index) => {
    const base = check.key?.split('-')[0]
    const amountTitle = { netTotal: en ? 'Net amount' : 'Netto', vatTotal: en ? 'VAT' : 'MwSt.', grossTotal: en ? 'Total amount' : 'Gesamtbetrag' }[base]
    const detailTitle = { databaseNetTotal: ['Netto / Auftragsdaten', 'Net amount / order data'], databaseVatTotal: ['MwSt. / Auftragsdaten', 'VAT / order data'], databaseGrossTotal: ['Gesamtbetrag / Auftragsdaten', 'Total amount / order data'] }[base]
    const title = amountTitle || detailTitle?.[en ? 1 : 0] || (en ? labels[base] || check.label : (check.label || check.key || '').replace(' (Cent)', ''))
    const referenceOrigin = {
      database: en ? 'Order data' : 'Auftragsdaten',
      business_rule: en ? 'Business rule' : 'Prüfregel',
      reference_calculation: en ? 'Order net + tax rule' : 'Auftragsnetto + Steuerregel',
      derived_order: en ? 'Order net + tax rule' : 'Auftragsnetto + Steuerregel',
      invoice_arithmetic: en ? 'Invoice arithmetic' : 'Rechnung intern',
      invoice_positions: en ? 'Invoice item sum' : 'Rechnungspositionen',
    }[check.comparisonOrigin]
    const details = [check.message, check.sourceText || check.quote].filter(Boolean).join('\n')
    return <article className="invoice-review-check" key={check.displayId || `${check.key}-${index}`}>
      <div className="invoice-review-check-name"><strong>{title}{check.transportTa && <small>TA {check.transportTa}</small>}</strong><Source text={details} /></div>
      <span className="invoice-review-value" aria-label={en ? 'Invoice' : 'Rechnung'}>{formatInvoiceCheckValue(check, check.actual, { language, currency, side: 'actual' })}</span>
      <span className="invoice-review-value" aria-label={en ? 'Reference' : 'Vergleich'}>{formatInvoiceCheckValue(check, check.expected, { language, currency, side: 'expected' })}{referenceOrigin && <small className="invoice-review-file" style={{ display: 'block' }}>{referenceOrigin}</small>}</span>
      <InvoiceReviewStatus status={check.status} color={check.color} />
    </article>
  })}</div>
}

function Distribution({ checks }) {
  const { language } = useLanguage()
  const en = language === 'en'
  const { counts, percentages, total } = invoiceReviewDistribution(checks)
  const colors = ['green', 'yellow', 'red']
  return <div className="invoice-review-distribution">
    <div className="invoice-review-bar" role="img" aria-label={total ? colors.map(color => `${percentages[color]}% ${colorLabels[color][en ? 1 : 0]}`).join(', ') : en ? 'No main checks available' : 'Keine Hauptprüfpunkte vorhanden'}>
      {total ? colors.filter(color => counts[color]).map(color => <span key={color} className={`invoice-review-segment invoice-review-segment--${color}`} style={{ width: `${counts[color] / total * 100}%` }} />) : <span className="invoice-review-segment invoice-review-segment--gray" style={{ width: '100%' }} />}
    </div>
    <div className="invoice-review-bar-legend">{total ? colors.map(color => <span key={color} className={`invoice-review-status--${color}`}><i className="invoice-review-dot" aria-hidden="true" /><strong>{percentages[color]}%</strong> {colorLabels[color][en ? 1 : 0]} <small>({counts[color]})</small></span>) : <span>{en ? 'No main checks available' : 'Keine Hauptprüfpunkte vorhanden'}</span>}</div>
    <small className="invoice-review-distribution-caption">{total} {en ? 'main checks · equal weight' : 'Hauptprüfpunkte · gleich gewichtet'}</small>
  </div>
}

function Disclosure({ title, children }) {
  return <details className="invoice-review-disclosure"><summary>{title}</summary>{children}</details>
}

function TransportDetails({ transport, currency, w }) {
  const sources = (transport.assignmentSources || []).map(source => [source.sourceName || ({ subject: w('Mailbetreff', 'Email subject'), body: w('Mailtext', 'Email body'), mail: w('Mail', 'Email'), invoice: w('Rechnung', 'Invoice'), document: w('Dokument', 'Document') })[source.sourceType] || w('Dokument', 'Document'), source.value, source.quote].filter(Boolean).join(' · '))
  return <div className="invoice-review-transport-detail"><div className="invoice-review-candidate-heading"><strong>TA {transport.ta || '—'}</strong>{transport.source && <small>{transport.source}</small>}{transport.orderId && transport.localExists !== false && <Link to={`/transportauftraege/${transport.orderId}`}>{w('Auftrag öffnen', 'Open order')}</Link>}</div>
    <Checks checks={invoiceTransportChecks(transport)} currency={currency} />
    {(transport.candidates || []).map((candidate, index) => <Disclosure key={`${candidate.ta}-${index}`} title={`${w('Kandidat', 'Candidate')} ${index + 1}: ${candidate.ta || '—'}`}><Checks checks={candidate.checks} currency={currency} /></Disclosure>)}
    <Source text={[...sources, transport.message, ...(transport.evidence || []).map(evidence => [evidence.ta, evidence.net].filter(Boolean).join(' · '))].filter(Boolean).join('\n')} label={w('Quellen', 'Sources')} />
  </div>
}

export default function InvoiceReviewResults({ report }) {
  const { language } = useLanguage()
  const w = (de, en) => language === 'en' ? en : de
  const invoices = report.invoices || []
  const reviewedAt = new Date(report.createdAt)
  const allChecks = invoices.flatMap(invoice => invoiceDisplayChecks(invoice).primary)
  return <div className="invoice-review-results"><header className="invoice-review-summary"><strong>{w('Rechnungsprüfung', 'Invoice review')}</strong>{!Number.isNaN(reviewedAt.getTime()) && <small>{reviewedAt.toLocaleString(language === 'en' ? 'en-GB' : 'de-DE', { timeZone: 'Europe/Berlin' })}</small>}</header>
    <div className="invoice-review-body">
      {invoices.length > 1 && <Distribution checks={allChecks} />}
      {invoices.map((invoice, index) => {
        const { primary, secondary } = invoiceDisplayChecks(invoice)
        const amountDetails = invoiceAmountDetails(invoice)
        const secondaryMismatches = secondary.filter(check => invoiceCheckColor(check) === 'red').length
        const metadata = [invoice.extractionMethod && w('Erkennung: ', 'Recognition: ') + invoice.extractionMethod, ...(invoice.warnings || []), ...(invoice.notices || []).map(notice => notice.message || notice)].filter(Boolean).join('\n')
        return <section className="invoice-review-invoice" key={`${report.id || report.createdAt}:${index}`}>
          <div className="invoice-review-invoice-heading"><h3>{w('Rechnung', 'Invoice')} {invoice.number || '—'}</h3>{invoice.currency && <span className="invoice-review-file">{invoice.currency}</span>}</div>
          <p className="invoice-review-file">{[invoice.issuer, invoice.fileName].filter(Boolean).join(' · ')}</p>
          {invoice.invoicePages?.length > 0 && <p className="invoice-review-file">{w('Rechnungsseiten', 'Invoice pages')}: {invoice.invoicePages.join(', ')}</p>}
          <Distribution checks={primary} />
          <Checks checks={primary} currency={invoice.currency} />
          {amountDetails.length > 0 && <Disclosure title={w('Betragsdetails', 'Amount details')}><Checks checks={amountDetails} currency={invoice.currency} /></Disclosure>}
          {secondary.length > 0 && <Disclosure title={<>{w('Ergänzende Angaben', 'Additional information')}{secondaryMismatches > 0 && <span className="invoice-review-secondary-alert invoice-review-status--red"><i className="invoice-review-dot" aria-hidden="true" />{secondaryMismatches} {w('abweichend', 'different')}</span>}</>}><Checks checks={secondary} currency={invoice.currency} /></Disclosure>}
          {(invoice.transports || []).length > 0 && <Disclosure title={w('Auftragsvergleich und Quellen', 'Order comparison and sources')}>{invoice.transports.map((transport, i) => <TransportDetails key={i} transport={transport} currency={invoice.currency} w={w} />)}</Disclosure>}
          {metadata && <Disclosure title={w('Erkennungsdetails', 'Recognition details')}><p className="invoice-review-technical">{metadata}</p></Disclosure>}
        </section>
      })}
      {report.documents?.length > 0 && <Disclosure title={w('Dokumentübersicht', 'Document overview')}><div className="invoice-review-document-list">{report.documents.map((document, index) => <div key={document.sourceId || index}><strong>{document.name || w('Dokument', 'Document')}</strong><small>{[document.contentType, document.pageCount && `${document.pageCount} ${w('Seite(n)', 'page(s)')}`].filter(Boolean).join(' · ')}</small></div>)}</div></Disclosure>}
      {!invoices.length && <p className="invoice-review-empty">{report.message || w('Keine Rechnung erkannt.', 'No invoice detected.')}</p>}
      {(report.message && invoices.length > 0 || report.notices?.length > 0) && <Disclosure title={w('Weitere Details', 'Additional details')}><p className="invoice-review-technical">{[report.message, ...(report.notices || []).map(notice => notice.message || notice)].filter(Boolean).join('\n')}</p></Disclosure>}
      <p className="invoice-review-scope">{w('Datenabgleich · keine Zahlungsfreigabe', 'Data comparison · no payment approval')}</p>
    </div>
  </div>
}
