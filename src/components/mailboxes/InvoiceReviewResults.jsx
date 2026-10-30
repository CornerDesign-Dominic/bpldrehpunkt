import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../../i18n/useLanguage.js'
import { invoiceCheckColor, invoiceCheckCounts, invoicePrimarySections, invoiceReviewColors, invoiceTransportChecks, formatInvoiceCheckValue } from '../../lib/invoiceReviewPresentation.js'
import '../../styles/invoiceReview.css'

const colorLabels = {
  green: ['Übereinstimmung', 'Match'], yellow: ['Prüfen', 'Review required'], red: ['Abweichung', 'Mismatch'],
  blue: ['Information', 'Information'], gray: ['Keine Angabe', 'No information'],
}

export function InvoiceReviewStatus({ status, color }) {
  const { language } = useLanguage()
  const tone = invoiceCheckColor({ status, color })
  const label = status === 'unassigned' && !color ? ['Keine Zuordnung', 'Unassigned'] : colorLabels[tone]
  return <span className={`invoice-review-status invoice-review-status--${tone}`}><i className="invoice-review-dot" aria-hidden="true" />{label[language === 'en' ? 1 : 0]}</span>
}

function ColorCounts({ checks }) {
  const { language } = useLanguage()
  const counts = invoiceCheckCounts(checks)
  const visible = invoiceReviewColors.filter(color => counts[color])
  return <span className="invoice-review-counts">{(visible.length ? visible : ['gray']).map(color => <span className={`invoice-review-count invoice-review-status--${color}`} key={color} aria-label={`${counts[color]} ${colorLabels[color][language === 'en' ? 1 : 0]}`} title={colorLabels[color][language === 'en' ? 1 : 0]}><strong>{counts[color]}</strong><i className="invoice-review-dot" aria-hidden="true" /></span>)}</span>
}

function Source({ text, children }) {
  const { language } = useLanguage()
  const [open, setOpen] = useState(false)
  const id = useId()
  return <>{children}{text && <><button type="button" className="invoice-review-source-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>{language === 'en' ? 'Source' : 'Quelle'}</button><blockquote id={id} hidden={!open}>{text}</blockquote></>}</>
}

const labels = { ocr: 'OCR readability', net: 'Net amount', netTotal: 'Net total', vat: 'VAT', vatTotal: 'VAT total', gross: 'Gross amount', grossTotal: 'Gross total', currency: 'Currency', issuer: 'Invoice issuer / carrier', recipient: 'Invoice recipient', issuerVatId: 'Carrier VAT ID', recipientVatId: 'Recipient VAT ID', recipientAddress: 'Invoice address', loadingDate: 'Loading date', unloadingDate: 'Unloading date', loadingCity: 'Loading city', unloadingCity: 'Unloading city', licensePlate: 'Licence plate', positionSum: 'Item sum / invoice net', taxSum: 'Net + tax / gross', number: 'Invoice number', date: 'Invoice date', lookup: 'Missing data from DyCoS', paymentDays: 'Payment term', paymentTerms: 'Payment terms', dueDate: 'Due date', foreignVat: 'VAT charged by foreign carrier', billingStatus: 'Previous billing / duplicate check', ta: 'Transport order assignment' }

function Checks({ checks = [], currency }) {
  const { language } = useLanguage()
  const en = language === 'en'
  if (!checks.length) return <p className="invoice-review-empty">{en ? 'No comparison information available.' : 'Keine Vergleichsangaben vorhanden.'}</p>
  return <div className="invoice-review-checks">{checks.map((check, index) => <article className={`invoice-review-check invoice-review-check--${invoiceCheckColor(check)}`} key={`${check.key}-${index}`}>
    <div className="invoice-review-check-heading"><strong>{en ? labels[check.key?.split('-')[0]] || check.label : (check.label || check.key || '').replace(' (Cent)', '')}</strong><InvoiceReviewStatus status={check.status} color={check.color} /></div>
    <div className="invoice-review-values"><div><span>{en ? 'Invoice' : 'Rechnung'}</span><strong>{formatInvoiceCheckValue(check, check.actual, { language, currency, side: 'actual' })}</strong></div><div><span>{en ? 'Reference' : 'Vergleichswert'}</span><strong>{formatInvoiceCheckValue(check, check.expected, { language, currency, side: 'expected' })}</strong></div></div>
    {(check.message || check.sourceText || check.quote) && <div className="invoice-review-check-note"><Source text={check.sourceText || check.quote}>{check.message || ''}</Source></div>}
  </article>)}</div>
}

function ReviewSection({ sectionKey, title, checks = [], expandedKey, setExpandedKey, children }) {
  const contentId = useId()
  const open = expandedKey === sectionKey
  return <section className={`invoice-review-section${open ? ' is-open' : ''}`}><h4><button className="invoice-review-section-toggle" type="button" aria-expanded={open} aria-controls={contentId} onClick={() => setExpandedKey(open ? null : sectionKey)}><span className="invoice-review-section-title"><span className="invoice-review-expander" aria-hidden="true">{open ? '−' : '+'}</span>{title}</span><ColorCounts checks={checks} /></button></h4><div id={contentId} className="invoice-review-section-content" hidden={!open}>{children}</div></section>
}

function TransportResult({ transport, currency, w }) {
  const candidates = transport.candidates || []
  return <>
    {transport.message && <p className="invoice-review-note">{transport.message}</p>}
    {transport.uncertainTa && <p className="invoice-review-note invoice-review-status--yellow">{w('Zuordnung unsicher. Mögliche Aufträge sind getrennt verglichen; ihre Beträge werden nicht addiert.', 'Assignment uncertain. Candidate orders are compared separately; their amounts are not added.')}</p>}
    {transport.source && <p className="invoice-review-note">{w('Verglichen mit', 'Compared with')}: {transport.source}</p>}
    {transport.orderId && (transport.localExists !== false ? <Link className="invoice-review-order-link" to={`/transportauftraege/${transport.orderId}`}>{w('Transport öffnen', 'Open transport')}</Link> : <p className="invoice-review-note">{w('Auftrag aus DyCoS gelesen; noch nicht in Drehpunkt importiert.', 'Order read from DyCoS; not yet imported into Drehpunkt.')}</p>)}
    <Checks checks={invoiceTransportChecks(transport)} currency={currency} />
    {candidates.length > 0 && <div className="invoice-review-candidates"><h5>{w('Mögliche Zuordnungen', 'Candidate assignments')}</h5>{candidates.map((candidate, index) => <section className="invoice-review-candidate" key={`${candidate.ta}-${index}`}><div className="invoice-review-candidate-heading"><strong>{index + 1}. TA {candidate.ta || '—'}</strong>{typeof candidate.score === 'number' && <span>{candidate.score} {w('Übereinstimmungspunkte', 'matching points')}</span>}</div>{candidate.message && <p className="invoice-review-note">{candidate.message}</p>}{candidate.orderId && candidate.localExists !== false && <Link to={`/transportauftraege/${candidate.orderId}`}>{w('Transport öffnen', 'Open transport')}</Link>}<Checks checks={candidate.checks} currency={currency} /></section>)}</div>}
    {transport.evidence?.length > 0 && <div className="invoice-review-evidence"><Source text={transport.evidence.map(evidence => [evidence.ta, evidence.net].filter(Boolean).join(' · ')).filter(Boolean).join('\n')}>{w('Belege aus der Rechnung', 'Invoice evidence')}</Source></div>}
  </>
}

export default function InvoiceReviewResults({ report }) {
  const { language } = useLanguage()
  const w = (de, en) => language === 'en' ? en : de
  const [expandedKey, setExpandedKey] = useState(null)
  const reportKey = report.id || report.createdAt || 'report'
  const reviewedAt = new Date(report.createdAt)
  return <div className="invoice-review-results"><header className="invoice-review-summary"><div><strong>{w('Gesamtprüfung', 'Overall review')}</strong><InvoiceReviewStatus status={report.status} color={report.color} /></div>{!Number.isNaN(reviewedAt.getTime()) && <small>{w('Prüfstand', 'Reviewed at')}: {reviewedAt.toLocaleString(language === 'en' ? 'en-GB' : 'de-DE', { timeZone: 'Europe/Berlin' })}</small>}</header>
    <div className="invoice-review-body">{report.message && <p className="invoice-review-note" role="status">{report.message}</p>}
    {report.notices?.length > 0 && <div className="invoice-review-important"><strong>{w('Wichtige Hinweise', 'Important notes')}</strong><ul>{report.notices.map((notice, index) => <li key={index}>{notice.message || notice}</li>)}</ul></div>}
    {(report.invoices || []).map((invoice, index) => {
      const key = `${reportKey}:${index}`
      const primary = invoicePrimarySections(invoice)
      const information = [
        { key: 'currency', label: w('Währung', 'Currency'), actual: invoice.currency || null, expected: null, color: invoice.currency ? 'blue' : 'gray' },
        ...(invoice.extractionMethod === 'ocr_only' ? [{ key: 'ocr', label: w('Texterkennung', 'Text recognition'), actual: w('Nur per OCR gelesen', 'Read using OCR only'), expected: null, color: 'blue' }] : invoice.extractionMethod === 'text_and_ocr' ? [{ key: 'ocr', label: w('Texterkennung', 'Text recognition'), actual: w('Textebene und OCR', 'Text layer and OCR'), expected: null, color: 'blue' }] : invoice.ocrPages?.length ? [{ key: 'ocr', label: 'OCR', actual: `${w('Seiten', 'Pages')} ${invoice.ocrPages.join(', ')}`, expected: null, color: 'blue' }] : []),
        ...(invoice.ocrUncertainPages?.length ? [{ key: 'ocrUncertain', label: w('OCR-Lesbarkeit', 'OCR readability'), actual: `${w('Unsichere Stellen auf Seiten', 'Uncertain text on pages')} ${invoice.ocrUncertainPages.join(', ')}`, expected: null, color: 'yellow' }] : []),
        ...(invoice.ocrDifferencePages?.length ? [{ key: 'ocrDifference', label: w('OCR-Abgleich', 'OCR comparison'), actual: `${w('Abweichungen zwischen Textebene und OCR auf Seiten', 'Differences between text layer and OCR on pages')} ${invoice.ocrDifferencePages.join(', ')}`, expected: null, color: 'yellow' }] : []),
        ...(invoice.warnings || []).map((warning, i) => ({ key: `warning-${i}`, label: w('Prüfhinweis', 'Review note'), actual: warning, expected: null, color: 'yellow' })),
      ]
      const sectionProps = { expandedKey, setExpandedKey }
      return <section className="invoice-review-invoice" key={key}><div className="invoice-review-invoice-heading"><h3>{w('Rechnung', 'Invoice')} {invoice.number || '—'}</h3><InvoiceReviewStatus status={invoice.status} color={invoice.color} /></div><p className="invoice-review-file">{[invoice.issuer, invoice.fileName].filter(Boolean).join(' · ')}</p>
        {invoice.notices?.length > 0 && <div className="invoice-review-important"><strong>{w('Wichtige Hinweise', 'Important notes')}</strong><ul>{invoice.notices.map((notice, i) => <li key={i}>{notice.message || notice}</li>)}</ul></div>}
        <ReviewSection sectionKey={`${key}:header`} title={w('Rechnungsaussteller und Empfänger', 'Invoice issuer and recipient')} checks={primary.header} {...sectionProps}><Checks checks={primary.header} currency={invoice.currency} /></ReviewSection>
        <ReviewSection sectionKey={`${key}:amounts`} title={w('Rechnungsbeträge', 'Invoice amounts')} checks={primary.amounts} {...sectionProps}><Checks checks={primary.amounts} currency={invoice.currency} /></ReviewSection>
        <ReviewSection sectionKey={`${key}:payment`} title={w('Zahlungsziel', 'Payment terms')} checks={primary.payment} {...sectionProps}><Checks checks={primary.payment} currency={invoice.currency} /></ReviewSection>
        {(invoice.transports || []).map((transport, i) => <ReviewSection key={`${key}:ta:${i}`} sectionKey={`${key}:ta:${i}`} title={transport.ta ? `TA ${transport.ta}` : w('TA-Zuordnung', 'TA assignment')} checks={invoiceTransportChecks(transport)} {...sectionProps}><TransportResult transport={transport} currency={invoice.currency} w={w} /></ReviewSection>)}
        <ReviewSection sectionKey={`${key}:information`} title={w('Weitere Angaben und Erkennung', 'Additional information and recognition')} checks={information} {...sectionProps}><Checks checks={information} currency={invoice.currency} /></ReviewSection>
      </section>
    })}
    <p className="invoice-review-scope">{w('Gespeicherter Datenabgleich. Keine Zahlungsfreigabe oder abschließende steuerrechtliche Prüfung.', 'Saved data comparison. No payment approval or final tax assessment.')}</p>
    </div>
  </div>
}
