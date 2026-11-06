import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../../i18n/useLanguage.js'
import { invoiceCheckColor, invoiceCheckResultLabel, invoiceDisplayChecks, invoiceReviewDistribution, invoiceTransportChecks, invoiceAmountDetails, invoiceReviewAlerts, formatInvoiceCheckValue } from '../../lib/invoiceReviewPresentation.js'
import '../../styles/invoiceReview.css'

const colorLabels = {
  green: ['Übereinstimmend', 'Matching'], yellow: ['Ungeklärt', 'Unresolved'], red: ['Abweichend', 'Different'],
  blue: ['Ergänzend', 'Additional'], gray: ['Ergänzend', 'Additional'],
}
const primaryRowOrder = { ta: 0, billingStatus: 1, factoring: 2 }

export function InvoiceReviewStatus({ status, color, label }) {
  const { language } = useLanguage()
  const tone = invoiceCheckColor({ status, color })
  return <span className={`invoice-review-status invoice-review-status--${tone === 'blue' ? 'gray' : tone}`}><i className="invoice-review-dot" aria-hidden="true" />{label || colorLabels[tone][language === 'en' ? 1 : 0]}</span>
}

function Source({ text, label }) {
  const { language } = useLanguage()
  const [open, setOpen] = useState(false)
  const id = useId()
  if (!text) return null
  return <span className="invoice-review-source"><button type="button" className="invoice-review-source-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>{label || (language === 'en' ? 'Details' : 'Details')}</button><span id={id} className="invoice-review-source-text" hidden={!open}>{text}</span></span>
}

const labels = { ocr: 'Text recognition', net: 'Net amount', netTotal: 'Net total / orders', vat: 'VAT', vatTotal: 'VAT / reference', gross: 'Gross amount', grossTotal: 'Gross / reference', currency: 'Currency', issuer: 'Invoice issuer / carrier', recipient: 'Invoice recipient', issuerVatId: 'Carrier VAT ID', recipientVatId: 'Recipient VAT ID', recipientAddress: 'Invoice address', loadingDate: 'Loading date', unloadingDate: 'Unloading date', loadingCity: 'Loading city', unloadingCity: 'Unloading city', licensePlate: 'Licence plate', positionSum: 'Item sum / invoice net', taxSum: 'Net + tax / gross', number: 'Invoice number', date: 'Invoice date', lookup: 'DyCoS lookup', paymentDays: 'Payment term', paymentTerms: 'Payment terms', dueDate: 'Due date', foreignVat: 'Foreign-carrier VAT', billingStatus: 'Invoice already present in DyCoS', ta: 'Transport order', serviceDate: 'Service date', deliveryDate: 'Delivery date' }

function Checks({ checks = [], currency }) {
  const { language } = useLanguage()
  const en = language === 'en'
  if (!checks.length) return null
  return <div className="invoice-review-checks"><div className="invoice-review-column-head" aria-hidden="true"><span>{en ? 'Check' : 'Prüfpunkt'}</span><span>{en ? 'Invoice' : 'Rechnung'}</span><span>{en ? 'Reference' : 'Vergleich'}</span><span>{en ? 'Result' : 'Ergebnis'}</span></div>{checks.map((check, index) => {
    const base = check.key?.split('-')[0]
    const amountTitle = { netTotal: en ? 'Net amount' : 'Netto', vatTotal: en ? 'VAT' : 'USt.', grossTotal: en ? 'Gross amount' : 'Brutto' }[base]
    const detailTitle = { databaseNetTotal: ['Netto / Auftragsdaten', 'Net amount / order data'], databaseVatTotal: ['MwSt. / Auftragsdaten', 'VAT / order data'], databaseGrossTotal: ['Gesamtbetrag / Auftragsdaten', 'Total amount / order data'] }[base]
    const title = base === 'billingStatus' ? en ? 'External document number' : 'Ext. Belegnummer' : base === 'factoring' ? 'Factoring' : base === 'paymentTerms' ? en ? 'Payment term' : 'Zahlungsziel' : amountTitle || detailTitle?.[en ? 1 : 0] || (en ? labels[base] || check.label : (check.label || check.key || '').replace(' (Cent)', ''))
    const referenceOrigin = {
      database: en ? 'Order data' : 'Auftragsdaten',
      business_rule: en ? 'Business rule' : 'Prüfregel',
      reference_calculation: en ? 'Order net + tax rule' : 'Auftragsnetto + Steuerregel',
      derived_order: en ? 'Order net + tax rule' : 'Auftragsnetto + Steuerregel',
      invoice_arithmetic: en ? 'Invoice arithmetic' : 'Rechnung intern',
      invoice_positions: en ? 'Invoice item sum' : 'Rechnungspositionen',
    }[check.comparisonOrigin]
    const evidence = base === 'paymentTerms' ? [] : check.paymentEvidence || []
    const evidenceName = key => ({ dueDate: en ? 'Due' : 'Fällig', paymentDays: en ? 'Term in days' : 'Frist in Tagen', paymentTerms: en ? 'Payment term' : 'Zahlungsziel' })[key?.split('-')[0]] || (en ? 'Additional information' : 'Ergänzung')
    const amountDetails = (check.amountChecks || []).map(item => {
      const name = en ? labels[item.key] || ({ databaseNetTotal: 'Net / order data', databaseVatTotal: 'VAT / order data', databaseGrossTotal: 'Gross / order data' })[item.key] || item.label : (item.label || item.key).replace(' (Cent)', '')
      const actual = formatInvoiceCheckValue(item, item.actual, { language, currency, side: 'actual' })
      const expected = formatInvoiceCheckValue(item, item.expected, { language, currency, side: 'expected' })
      return `${name}: ${actual} / ${expected} · ${colorLabels[invoiceCheckColor(item)][en ? 1 : 0]}${item.message ? ` · ${item.message}` : ''}`
    })
    const details = [...amountDetails, check.message, check.sourceText || check.quote, ...evidence.flatMap(item => [item.message, item.sourceText])].filter(Boolean).join('\n')
    const billingLabel = check.key === 'billingStatus' && check.comparisonOrigin === 'dycos_invoice_headers'
      ? check.duplicate === true ? en ? 'Already booked' : 'Bereits gebucht'
        : check.matchCount > 0 || check.expected ? en ? 'Review' : 'Prüfen'
          : check.complete === true && invoiceCheckColor(check) === 'green' ? en ? 'Not yet booked' : 'Noch nicht gebucht'
            : en ? 'Unresolved' : 'Ungeklärt'
      : undefined
    return <article className="invoice-review-check" key={check.displayId || `${check.key}-${index}`}>
      <div className="invoice-review-check-name"><strong>{title}{check.transportTa && <small>TA {check.transportTa}</small>}</strong>{!['billingStatus', 'paymentTerms'].includes(base) && <Source text={details} />}</div>
      <span className="invoice-review-value" aria-label={en ? 'Invoice' : 'Rechnung'}>{formatInvoiceCheckValue(check, base === 'paymentTerms' && typeof check.actual === 'string' ? check.actual.split(' · ')[0].replace(/^aus Datumsangaben:\s*/u, '') : check.actual, { language, currency, side: 'actual' })}{evidence.filter(item => item.actual !== null && item.actual !== undefined && item.actual !== '').map((item, i) => <small className="invoice-review-payment-evidence" key={i}>{evidenceName(item.key)}: {formatInvoiceCheckValue(item, item.actual, { language, side: 'actual' })}</small>)}</span>
      <span className="invoice-review-value" aria-label={en ? 'Reference' : 'Vergleich'}>{formatInvoiceCheckValue(check, check.expected, { language, currency, side: 'expected' })}{evidence.filter(item => item.expected !== null && item.expected !== undefined && item.expected !== '').map((item, i) => <small className="invoice-review-payment-evidence" key={i}>{evidenceName(item.key)}: {formatInvoiceCheckValue(item, item.expected, { language, side: 'expected' })}</small>)}{referenceOrigin && <small className="invoice-review-file" style={{ display: 'block' }}>{referenceOrigin}</small>}</span>
      <InvoiceReviewStatus status={check.status} color={check.color} label={invoiceCheckResultLabel(check, language) || billingLabel} />
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
  </div>
}

function Disclosure({ title, children }) {
  return <details className="invoice-review-disclosure"><summary>{title}</summary>{children}</details>
}

function InvoiceAlerts({ invoice }) {
  const { language } = useLanguage()
  const en = language === 'en'
  const alerts = invoiceReviewAlerts(invoice)
  if (!alerts.length) return null
  return <div className="invoice-review-alerts">{['red', 'yellow'].map(color => {
    const items = alerts.filter(alert => alert.color === color)
    if (!items.length) return null
    return <div className={`invoice-review-alert invoice-review-alert--${color}`} key={color} role={color === 'red' ? 'alert' : 'status'} aria-atomic="true"><ul>{items.map((alert, index) => {
      const amountName = { net: en ? 'Net amount' : 'Netto', netTotal: en ? 'Net amount' : 'Netto', vat: en ? 'VAT' : 'MwSt.', vatTotal: en ? 'VAT' : 'MwSt.', gross: en ? 'Total amount' : 'Gesamtbetrag', grossTotal: en ? 'Total amount' : 'Gesamtbetrag' }[alert.key] || (en ? 'Amount' : 'Betrag')
      const title = alert.kind === 'factoring' ? en ? 'Factoring / assignment notice' : 'Factoring / Abtretungshinweis' : alert.kind === 'duplicate' ? en ? 'Invoice already present in DyCoS' : 'Rechnung bereits in DyCoS vorhanden' : alert.kind === 'possible_duplicate' ? en ? 'Possible duplicate – please review' : 'Achtung: mögliche Dublette – bitte prüfen' : `${amountName} ${en ? 'differs' : 'abweichend'}`
      const check = { ...alert, format: 'money' }
      return <li key={index}><strong>{title}</strong>{alert.kind === 'factoring' && <span className="invoice-review-alert-values">{alert.message}</span>}{alert.kind === 'amount' && <span className="invoice-review-alert-values">{en ? 'Invoice' : 'Rechnung'}: {formatInvoiceCheckValue(check, alert.actual, { language, currency: invoice.currency, side: 'actual' })} · {en ? 'Reference' : 'Vergleich'}: {formatInvoiceCheckValue(check, alert.expected, { language, currency: invoice.currency, side: 'expected' })}</span>}{(alert.ta || alert.externalNumber) && <small>{[alert.ta && `TA ${alert.ta}`, alert.externalNumber && `${en ? 'Document' : 'Beleg'} ${alert.externalNumber}`].filter(Boolean).join(' · ')}</small>}</li>
    })}</ul></div>
  })}</div>
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
  const fileNames = [...new Set(invoices.map(invoice => invoice.fileName).filter(Boolean))]
  const systemDetails = [report.message, ...(report.notices || []).map(notice => notice.message || notice)].filter(Boolean)
  const allChecks = invoices.flatMap(invoice => invoiceDisplayChecks(invoice).primary)
  return <div className="invoice-review-results"><header className="invoice-review-summary"><strong>{w('Rechnungsprüfung', 'Invoice review')}{fileNames.length > 0 && `: ${fileNames.join(', ')}`}</strong>{!Number.isNaN(reviewedAt.getTime()) && <small>{reviewedAt.toLocaleString(language === 'en' ? 'en-GB' : 'de-DE', { timeZone: 'Europe/Berlin' })}</small>}</header>
    <div className="invoice-review-body">
      {report.incomplete && <div className="invoice-review-alert invoice-review-alert--yellow invoice-review-incomplete" role="status" aria-atomic="true">
        <strong>{w('Prüfung unvollständig', 'Review incomplete')}</strong>
        <p>{w('Nicht lesbar und nicht geprüft:', 'Unreadable and not reviewed:')} {(report.unreadableDocuments || []).map(document => document.name || w('Unbekannter Anhang', 'Unknown attachment')).join(', ')}</p>
      </div>}
      {invoices.length > 1 && <Distribution checks={allChecks} />}
      {invoices.map((invoice, index) => {
        const { primary, secondary } = invoiceDisplayChecks(invoice)
        const displayPrimary = [...primary].sort((a, b) => (primaryRowOrder[a.key?.split('-')[0]] ?? 3) - (primaryRowOrder[b.key?.split('-')[0]] ?? 3))
        const amountDetails = invoiceAmountDetails(invoice)
        const secondaryMismatches = secondary.filter(check => invoiceCheckColor(check) === 'red').length
        return <section className="invoice-review-invoice" key={`${report.id || report.createdAt}:${index}`}>
          <Distribution checks={primary} />
          <InvoiceAlerts invoice={invoice} />
          <Checks checks={displayPrimary.map(check => ({ ...check, amountChecks: amountDetails.filter(detail => ({ positionSum: 'netTotal', databaseNetTotal: 'netTotal', netTotal: 'netTotal', foreignVat: 'vatTotal', databaseVatTotal: 'vatTotal', vatTotal: 'vatTotal', taxSum: 'grossTotal', databaseGrossTotal: 'grossTotal', grossTotal: 'grossTotal' })[detail.key] === check.key) }))} currency={invoice.currency} />
          {(secondary.length > 0 || invoice.transports?.length > 0) && <Disclosure title={<>{w('Weitere Abgleichungen', 'Additional comparisons')}{secondaryMismatches > 0 && <span className="invoice-review-secondary-alert invoice-review-status--red"><i className="invoice-review-dot" aria-hidden="true" />{secondaryMismatches} {w('abweichend', 'different')}</span>}</>}>
            {secondary.length > 0 && <Checks checks={secondary} currency={invoice.currency} />}
            {(invoice.transports || []).map((transport, i) => <TransportDetails key={i} transport={transport} currency={invoice.currency} w={w} />)}
          </Disclosure>}
        </section>
      })}
      {!invoices.length && <p className="invoice-review-empty">{report.message || w('Keine Rechnung erkannt.', 'No invoice detected.')}</p>}
      {(invoices.length > 0 || report.documents?.length > 0 || systemDetails.length > 0) && <Disclosure title={w('Weitere Details', 'Additional details')}>
        {invoices.map((invoice, index) => <div key={index}>
          {invoices.length > 1 && <strong>{w('Rechnung', 'Invoice')} {invoice.number || '—'}</strong>}
          {invoice.invoicePages?.length > 0 && <p className="invoice-review-technical">{w('Geprüfte Rechnungsseiten', 'Reviewed invoice pages')}: {invoice.invoicePages.length} ({invoice.invoicePages.join(', ')})</p>}
          <p className="invoice-review-technical">{[invoice.extractionMethod && w('Erkennung: ', 'Recognition: ') + invoice.extractionMethod, ...(invoice.warnings || []), ...(invoice.notices || []).map(notice => notice.message || notice)].filter(Boolean).join('\n')}</p>
        </div>)}
        {report.documents?.length > 0 && <div className="invoice-review-document-list">{report.documents.map((document, index) => <div key={document.sourceId || index}><strong>{document.name || w('Dokument', 'Document')}</strong><small>{[document.contentType, document.pageCount && `${document.pageCount} ${w('Seite(n)', 'page(s)')}`].filter(Boolean).join(' · ')}</small></div>)}</div>}
        {systemDetails.length > 0 && <p className="invoice-review-technical">{systemDetails.join('\n')}</p>}
      </Disclosure>}
      <p className="invoice-review-scope">{w('Datenabgleich · keine Zahlungsfreigabe', 'Data comparison · no payment approval')}</p>
    </div>
  </div>
}
