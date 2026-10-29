import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth.js'
import { useLanguage } from '../../i18n/useLanguage.js'
import { mailboxOrderWords } from '../../lib/mailboxOrderWords.js'
import { listBusinessPartners } from '../../lib/businessPartners.js'
import { businessPartnerRoles } from '../../../shared/businessPartnerRoles.js'
import { normalizeMailboxOrder, validateMailboxOrder } from '../../../shared/mailboxOrder.js'
import { mailboxOrderCustomerIdentity } from '../../../shared/mailboxOrderCustomerIdentity.js'
import { attachmentBlob, safeAttachmentName } from '../../lib/mailboxHelpers.js'
import { mailboxCall } from '../../lib/mailboxes.js'
import MailWorkDialog from './MailWorkDialog.jsx'
import '../../styles/mailboxOrder.css'

function OrderMessage({ source }) {
  const { language } = useLanguage()
  return mailboxOrderWords(language, source)
}

const drafts = new Map()
const read = (object, path) => path.split('.').reduce((value, key) => value?.[key], object)
const snapshot = value => JSON.stringify(value)
const numbers = partner => [...new Set([partner?.debtorNumber, ...(partner?.dycosReferences?.debtorNumbers || [])].map(value => String(value ?? '').trim()).filter(Boolean))]
const empty = value => value === '' || value === null || value === undefined
const sourcePath = (path, order, baseline) => {
  const parts = path.split('.')
  if (parts[0] !== 'stops') return path
  const currentStop = order.stops[Number(parts[1])]
  const previousStop = baseline?.stops.findIndex(stop => stop.id && stop.id === currentStop?.id) ?? -1
  if (previousStop < 0) return null
  parts[1] = String(previousStop)
  if (parts[2] === 'goods') {
    const currentGoods = currentStop.goods[Number(parts[3])]
    const previousGoods = baseline.stops[previousStop].goods.findIndex(goods => goods.id && goods.id === currentGoods?.id)
    if (previousGoods < 0) return null
    parts[3] = String(previousGoods)
  }
  return parts.join('.')
}
const makeGoods = () => ({ id: crypto.randomUUID(), description: '', quantity: null, packaging: '', weightKg: null, loadingMeters: null, lengthCm: null, widthCm: null, heightCm: null, volumeM3: null })
const makeStop = type => ({ id: crypto.randomUUID(), type, company: '', street: '', country: '', postalCode: '', city: '', date: '', timeFrom: '', timeUntil: '', fixed: false, reference: '', contactName: '', contactEmail: '', contactPhone: '', note: '', goods: [makeGoods()] })

function errorText(error, w) {
  if (error?.code === 'functions/permission-denied') return w('Für diese Aktion fehlen Berechtigungen oder die Postfachverbindung ist nicht mehr verfügbar.', 'Permission is missing or the mailbox connection is no longer available.')
  if (error?.code === 'functions/resource-exhausted') return w('Zu viele Auswertungen. Bitte später erneut versuchen.', 'Too many analyses. Try again later.')
  if (error?.code === 'functions/failed-precondition' || error?.code === 'functions/invalid-argument' || error?.code === 'functions/aborted') return <OrderMessage source={error.message || 'Bitte Angaben und Original-PDF prüfen oder erneut auswerten.'} />
  return w('Die Aktion konnte nicht abgeschlossen werden. Deine Eingaben bleiben erhalten. Bitte erneut versuchen.', 'The operation could not be completed. Your input is preserved. Try again.')
}

function OrderField({ path, label, order, baseline, provenance, attachments, issues, onChange, type = 'text', numeric = false, multiline = false, required = false, w }) {
  const id = useId()
  const value = read(order, path)
  const originalPath = sourcePath(path, order, baseline)
  const initial = originalPath ? read(baseline, originalPath) : undefined
  const modified = snapshot(value) !== snapshot(initial)
  const source = originalPath ? provenance.find(item => item.path === originalPath) : null
  const generated = !modified && !empty(initial) && initial !== false
  const problems = issues.filter(item => item.path === path)
  const sourceName = source?.sourceId === 'mail' ? w('Mail', 'Email') : attachments.find(item => item.id === source?.sourceId)?.name || source?.sourceId || w('Mail/PDF', 'Email/PDF')
  const handle = event => onChange(path, type === 'checkbox' ? event.target.checked : numeric ? event.target.value === '' ? null : Number(event.target.value) : event.target.value)
  const attributes = { id, value: value ?? '', onChange: handle, 'aria-invalid': problems.some(item => item.severity === 'error'), 'aria-describedby': `${id}-hint`, className: generated ? 'mail-order-input--ai' : undefined }
  return <div className={`mail-order-field${problems.some(item => item.severity === 'error') ? ' mail-order-field--missing' : ''}`}>
    <label htmlFor={id}><span>{label}{required && <span className="mail-order-required"> *</span>}</span>{type === 'checkbox' ? <input id={id} type="checkbox" checked={Boolean(value)} onChange={handle} /> : multiline ? <textarea {...attributes} rows={3} maxLength={4000} /> : <input {...attributes} type={numeric ? 'number' : type} step={numeric ? 'any' : undefined} min={numeric ? '0' : undefined} maxLength={numeric || ['date', 'time'].includes(type) ? undefined : 255} />}</label>
    <div id={`${id}-hint`} className="mail-order-field-hint">{modified ? <span className="mail-order-label--manual">{w('Manuell geändert', 'Edited manually')}</span> : generated ? <><span className="mail-order-label--ai">{w('KI-Vorschlag · prüfen', 'AI suggestion · review')}</span>{source?.verified === false && <small className="mail-order-label--warning">{w('Scan-Beleg · im Original prüfen', 'Scanned source · check original')}</small>}{source && <details><summary>{sourceName}{source.page ? ` · ${w('Seite', 'Page')} ${source.page}` : ''}</summary><blockquote>{source.quote}</blockquote></details>}{!source && <small>{w('Kein genauer Beleg hinterlegt.', 'No precise source recorded.')}</small>}</> : required && empty(value) ? <span className="mail-order-label--missing">{w('Wichtige Angabe fehlt', 'Important information missing')}</span> : null}{problems.map((item, index) => <small key={index} className={item.severity === 'error' ? 'mail-order-label--missing' : 'mail-order-label--warning'}><OrderMessage source={item.message} /></small>)}</div>
  </div>
}

export default function MailOrderAction({ identity, mailContent, dirtyRef, attachments: messageAttachments = [] }) {
  const { user } = useAuth()
  const { language } = useLanguage()
  const w = (de, en) => language === 'en' ? en : de
  const cacheKey = `${user?.uid}:${identity.connectionId}:${identity.messageId}`
  const cached = drafts.get(cacheKey)
  const availablePdfs = messageAttachments.filter(item => item.supported !== false && (item.contentType?.split(';')[0].toLowerCase() === 'application/pdf' || /\.pdf$/i.test(item.name || '')))
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState(cached?.preview || null)
  const [order, setOrder] = useState(cached?.order || null)
  const [baseline, setBaseline] = useState(cached?.baseline || null)
  const [selectedPdfIds, setSelectedPdfIds] = useState(cached?.selectedPdfIds || (availablePdfs.length <= 5 ? availablePdfs.map(item => item.id) : []))
  const [originalAttachmentId, setOriginalAttachmentId] = useState(cached?.originalAttachmentId || '')
  const [customerPartnerId, setCustomerPartnerId] = useState(cached?.customerPartnerId || '')
  const [customerNumber, setCustomerNumber] = useState(cached?.customerNumber || '')
  const [allowMissingPrice, setAllowMissingPrice] = useState(cached?.allowMissingPrice || false)
  const [confirmed, setConfirmed] = useState(false)
  const [partners, setPartners] = useState([])
  const [partnersLoading, setPartnersLoading] = useState(false)
  const [partnersError, setPartnersError] = useState(false)
  const [partnersReload, setPartnersReload] = useState(0)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saved, setSaved] = useState(cached?.saved || '')
  const [view, setView] = useState('mail')
  const [pdf, setPdf] = useState(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfError, setPdfError] = useState('')
  const generation = useRef(0)
  const pdfGeneration = useRef(0)
  const pdfUrl = useRef(null)
  const operation = useRef(cached?.operationId || null)
  const current = snapshot({ order, customerPartnerId, customerNumber, originalAttachmentId, allowMissingPrice, selectedPdfIds })
  const dirty = Boolean(order && current !== saved)
  const customer = partners.find(partner => partner.id === customerPartnerId)
  const customerNumbers = numbers(customer)
  const verifiedId = mailboxOrderCustomerIdentity(customer, customerNumber)
  const attachments = [...new Map([...availablePdfs, ...(preview?.attachments || [])].map(item => [item.id, item])).values()]
  const effectiveOrder = order && customer ? { ...order, customerName: customer.companyName, customerNumber } : order
  let issues = []
  if (order) {
    try { issues = validateMailboxOrder(effectiveOrder, { allowMissingPrice, companyCurrency: 'EUR' }) } catch { issues = [{ path: '', message: 'Die Auftragsangaben sind ungültig.', severity: 'error' }] }
  }
  const errors = issues.filter(item => item.severity === 'error')
  const sourceSelectionChanged = Boolean(preview && selectedPdfIds && snapshot([...selectedPdfIds].sort()) !== snapshot([...(preview.selectedPdfIds || preview.attachments.map(item => item.id))].sort()))
  const canExport = preview?.previewId && !preview.multipleOrders && !errors.length && verifiedId?.sourceId && verifiedId.number === customerNumber && verifiedId.kind === 'debtor' && originalAttachmentId && selectedPdfIds.includes(originalAttachmentId) && confirmed && !sourceSelectionChanged

  useEffect(() => {
    if (!open) return
    let active = true
    Promise.resolve().then(() => { if (!active) return []; setPartnersLoading(true); setPartnersError(false); return listBusinessPartners() }).then(items => { if (active) setPartners(items.filter(item => !item.mergedIntoPartnerId && item.status !== 'merged' && businessPartnerRoles(item).customer)) }).catch(() => { if (active) setPartnersError(true) }).finally(() => { if (active) setPartnersLoading(false) })
    return () => { active = false }
  }, [open, partnersReload])
  useEffect(() => {
    if (dirtyRef) dirtyRef.current = dirty
    if (order) drafts.set(cacheKey, { preview, order, baseline, selectedPdfIds, originalAttachmentId, customerPartnerId, customerNumber, allowMissingPrice, saved, operationId: operation.current })
  }, [dirtyRef, dirty, cacheKey, preview, order, baseline, selectedPdfIds, originalAttachmentId, customerPartnerId, customerNumber, allowMissingPrice, saved])
  useEffect(() => {
    if (!dirty) return
    const unload = event => { event.preventDefault(); event.returnValue = '' }
    const click = event => {
      const anchor = event.target.closest?.('a[href]')
      if (anchor && anchor.target !== '_blank' && !event.ctrlKey && !event.metaKey && !window.confirm(language === 'en' ? 'The order has not been exported. Leave this view? Your input remains in this browser session.' : 'Der Auftrag wurde noch nicht exportiert. Ansicht verlassen? Deine Eingaben bleiben in dieser Browsersitzung erhalten.')) { event.preventDefault(); event.stopPropagation() }
    }
    window.addEventListener('beforeunload', unload); document.addEventListener('click', click, true)
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', click, true) }
  }, [dirty, language])
  useEffect(() => {
    const request = generation; const pdfRequest = pdfGeneration; const ref = dirtyRef
    return () => { ++request.current; ++pdfRequest.current; if (pdfUrl.current) URL.revokeObjectURL(pdfUrl.current); if (ref) ref.current = false }
  }, [dirtyRef])

  function changed() { setConfirmed(false); setNotice(''); operation.current = null }
  function update(path, value) {
    changed()
    setOrder(previous => {
      const next = structuredClone(previous)
      const parts = path.split('.'); const leaf = parts.pop()
      const target = parts.reduce((entry, part) => entry[part], next)
      target[leaf] = value
      return next
    })
  }
  async function analyse() {
    if (busy) return
    if (order && dirty && !window.confirm(w('Erneut auswerten ersetzt das aktuelle Prüfformular. Fortfahren?', 'Analysing again replaces the current review form. Continue?'))) return
    const version = ++generation.current
    setBusy('analyse'); setError(''); setNotice('')
    try {
      const result = await mailboxCall('previewMailboxOrder', { ...identity, ...(selectedPdfIds ? { selectedPdfIds } : {}) })
      if (version !== generation.current) return
      const initial = normalizeMailboxOrder(result.order)
      initial.stops = initial.stops.map(stop => ({ ...stop, id: crypto.randomUUID(), goods: stop.goods.map(goods => ({ ...goods, id: crypto.randomUUID() })) }))
      setPreview(result); setOrder(initial); setBaseline(structuredClone(initial)); setConfirmed(false); setSaved(''); operation.current = null
      setSelectedPdfIds(result.selectedPdfIds || result.attachments.map(item => item.id))
      setOriginalAttachmentId(result.attachments.length === 1 ? result.attachments[0].id : '')
      setCustomerPartnerId(''); setCustomerNumber(''); setAllowMissingPrice(false)
    } catch (caught) { if (version === generation.current) setError(errorText(caught, w)) }
    finally { if (version === generation.current) setBusy('') }
  }
  async function showPdf(id) {
    setView(id)
    if (id === 'mail') return
    const version = ++pdfGeneration.current
    setPdfBusy(true); setPdfError('')
    try {
      const data = await mailboxCall('getMailboxAttachment', { ...identity, attachmentId: id })
      if (version !== pdfGeneration.current) return
      if (data.contentType?.split(';')[0].toLowerCase() !== 'application/pdf') throw new Error('not-pdf')
      const url = URL.createObjectURL(attachmentBlob(data))
      if (pdfUrl.current) URL.revokeObjectURL(pdfUrl.current)
      pdfUrl.current = url; setPdf({ id, url, name: safeAttachmentName(data.name || attachments.find(item => item.id === id)?.name) })
    } catch { if (version === pdfGeneration.current) setPdfError(w('Die PDF-Vorschau konnte nicht geladen werden. Bitte erneut versuchen.', 'Could not load the PDF preview. Try again.')) }
    finally { if (version === pdfGeneration.current) setPdfBusy(false) }
  }
  async function exportXml(event) {
    event.preventDefault()
    if (busy || !canExport) return
    setBusy('export'); setError(''); setNotice('')
    operation.current ||= crypto.randomUUID()
    const version = ++generation.current
    try {
      const result = await mailboxCall('exportMailboxOrder', { ...identity, previewId: preview.previewId, order: normalizeMailboxOrder(effectiveOrder), customerPartnerId, customerNumber, originalAttachmentId, allowMissingPrice, confirmed: true, operationId: operation.current })
      if (version !== generation.current) return
      if (typeof result.xmlBase64 !== 'string' || !result.xmlBase64 || typeof result.fileName !== 'string') throw new Error('invalid-export')
      const bytes = Uint8Array.from(atob(result.xmlBase64), char => char.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/xml;charset=iso-8859-1' }))
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = safeAttachmentName(result.fileName); document.body.append(anchor); anchor.click(); anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 30000)
      setSaved(current); setConfirmed(false); setNotice(w('XML erstellt und Download gestartet. In DyCoS wurde noch kein Auftrag angelegt.', 'XML created and download started. No order has been created in DyCoS yet.'))
    } catch (caught) { if (version === generation.current) setError(errorText(caught, w)) }
    finally { if (version === generation.current) setBusy('') }
  }
  function close() {
    if (busy === 'export') return
    if (busy === 'analyse') { ++generation.current; setBusy('') }
    setOpen(false)
  }
  function field(path, de, en, options = {}) { return <OrderField key={path} path={path} label={w(de, en)} order={order} baseline={baseline} provenance={preview?.provenance || []} attachments={attachments} issues={issues} onChange={update} w={w} {...options} /> }
  function changeCustomer(id) {
    changed(); setCustomerPartnerId(id)
    const available = numbers(partners.find(partner => partner.id === id))
    setCustomerNumber(available.length === 1 ? available[0] : '')
  }
  function moveStop(index, offset) {
    changed()
    setOrder(previous => {
      const stops = [...previous.stops]
      const target = index + offset
      if (target < 0 || target >= stops.length) return previous
      ;[stops[index], stops[target]] = [stops[target], stops[index]]
      return { ...previous, stops }
    })
  }
  const left = <div className="mail-order-source"><label className="form-field"><span>{w('Quelle ansehen', 'View source')}</span><select value={view} onChange={event => void showPdf(event.target.value)}><option value="mail">{w('Mail und Schriftverkehr', 'Email and correspondence')}</option>{attachments.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>{view === 'mail' ? mailContent : <><h3>{attachments.find(item => item.id === view)?.name}</h3>{pdfBusy && <p role="status">{w('PDF wird geladen …', 'Loading PDF …')}</p>}{pdfError && <div role="alert"><p>{pdfError}</p><button type="button" onClick={() => void showPdf(view)}>{w('Erneut versuchen', 'Try again')}</button></div>}{!pdfBusy && pdf?.id === view && <><a href={pdf.url} target="_blank" rel="noopener noreferrer">{w('PDF in neuem Tab öffnen', 'Open PDF in new tab')}</a><object className="mail-order-pdf" data={pdf.url} type="application/pdf" aria-label={pdf.name}><a href={pdf.url} download={pdf.name}>{w('PDF herunterladen', 'Download PDF')}</a></object></>}</>}</div>

  return <><button type="button" onClick={() => { setOpen(true); if (!preview && !busy && availablePdfs.length <= 5) void analyse() }}>{w('Auftrag hinzufügen', 'Add order')}{dirty && <span className="mailbox-draft-indicator">{w(' · Erfassung vorhanden', ' · Capture available')}</span>}</button>
    <MailWorkDialog open={open} title={w('Auftrag hinzufügen', 'Add order')} left={left} onClose={close} busy={busy === 'export'} rightLoading={Boolean(busy)} loadingLabel={busy === 'export' ? w('XML wird erstellt …', 'Creating XML …') : w('Auftragsdaten werden gelesen – KI wertet Mail und PDF aus …', 'Reading order data – AI is analysing the email and PDF …')}>
      <div className="mail-order-editor"><p className="mailbox-hint">{w('Prüfe die Angaben aus Mail und PDF. Speichern erstellt eine XML mit Original-PDF zum Herunterladen. Die automatische DyCoS-Übergabe folgt später.', 'Review the email and PDF information. Saving creates an XML download including the original PDF. Automatic DyCoS transfer will follow later.')}</p>
      {error && <div className="mailbox-error" role="alert">{error}</div>}{notice && !order && <p className="mail-order-notice" role="status">{notice}</p>}
      {preview?.warnings?.length > 0 && <ul className="mail-order-warnings">{preview.warnings.map((warning, index) => <li key={index}><OrderMessage source={warning} /></li>)}</ul>}
      {preview?.multipleOrders && <p className="mail-order-missing" role="alert">{w('Mehrere Aufträge erkannt. Bitte nur die PDFs eines Auftrags auswählen und erneut auswerten. Der Export ist bis zur eindeutigen Erfassung gesperrt.', 'Multiple orders detected. Select only the PDFs for one order and analyse again. Export is blocked until one order is identified.')}</p>}
      {attachments.length > 0 && <fieldset disabled={Boolean(busy)} className="mail-order-pdf-selection"><legend>{w('PDFs für die Auswertung', 'PDFs to analyse')}</legend><p className="mailbox-hint">{w('Höchstens fünf PDFs, je 5 MB und zusammen 15 MB. Nur Dokumente desselben Auftrags auswählen.', 'Up to five PDFs, 5 MB each and 15 MB total. Select documents for the same order only.')}</p>{attachments.map(item => <label key={item.id}><input type="checkbox" checked={selectedPdfIds?.includes(item.id) || false} disabled={!selectedPdfIds?.includes(item.id) && selectedPdfIds?.length >= 5} onChange={event => { changed(); setSelectedPdfIds(currentIds => event.target.checked ? [...(currentIds || []), item.id] : (currentIds || []).filter(id => id !== item.id)) }} />{item.name}</label>)}{sourceSelectionChanged && <p className="mail-order-label--warning">{w('PDF-Auswahl geändert. Bitte erneut auswerten.', 'PDF selection changed. Analyse again.')}</p>}</fieldset>}
      <button className="button button--secondary" type="button" disabled={Boolean(busy)} onClick={() => void analyse()}>{w('Erneut auswerten', 'Analyse again')}</button>
      {order && <form onSubmit={exportXml} noValidate><fieldset className="mail-order-form" disabled={Boolean(busy)}>
        <details open><summary>{w('Auftraggeber und Auftrag', 'Customer and order')}</summary><div className="mail-order-grid">
          {field('customerName', 'Auftraggeber laut Quelle', 'Customer from source')}{field('customerNumber', 'Kundennummer laut Quelle', 'Customer number from source')}
          <div className="mail-order-field"><label className="form-field"><span>{w('Frachtzahler aus Stammdaten *', 'Freight payer from master data *')}</span><select value={customerPartnerId} disabled={partnersLoading} onChange={event => changeCustomer(event.target.value)}><option value="">{partnersLoading ? w('Kunden werden geladen …', 'Loading customers …') : w('Kunden auswählen', 'Select customer')}</option>{partners.map(partner => <option key={partner.id} value={partner.id}>{partner.companyName} · {numbers(partner).join(', ')}</option>)}</select></label><span className="mail-order-label--manual">{w('Vom Nutzer zu bestätigen', 'Confirm manually')}</span>{partnersError && <div role="alert"><p>{w('Kunden konnten nicht geladen werden.', 'Could not load customers.')}</p><button className="button button--secondary" type="button" onClick={() => setPartnersReload(value => value + 1)}>{w('Erneut versuchen', 'Try again')}</button></div>}</div>
          <div className="mail-order-field"><label className="form-field"><span>{w('Debitorenreferenz *', 'Customer account reference *')}</span><select value={customerNumber} onChange={event => { changed(); setCustomerNumber(event.target.value) }} disabled={!customerPartnerId}><option value="">{w('Referenz auswählen', 'Select reference')}</option>{customerNumbers.map(number => <option key={number} value={number}>{number}</option>)}</select></label>{verifiedId ? <small>{w('Verifizierte interne DyCoS-ID:', 'Verified internal DyCoS ID:')} {verifiedId.sourceId}</small> : <small className="mail-order-label--missing">{w('Verifizierte DyCoS-Adress-ID fehlt. Bitte Kunden über die direkte Schnittstelle ergänzen.', 'Verified DyCoS address ID is missing. Update the customer through the direct connection.')}</small>}</div>
          {field('customerReference', 'Kundenreferenz', 'Customer reference', { required: true })}{field('vehicleType', 'Fahrzeugart', 'Vehicle type')}{field('loadingDate', 'Ladedatum', 'Loading date', { type: 'date', required: true })}{field('unloadingDate', 'Entladedatum', 'Unloading date', { type: 'date', required: true })}{field('contactName', 'Ansprechpartner Auftrag', 'Order contact')}
        </div></details>
        <details open><summary>{w('Reihenfolge der Stellen im XML', 'Stop sequence in XML')}</summary><ol className="mail-order-route">{order.stops.map((stop, index) => <li key={stop.id || index}><span>{stop.type === 'loading' ? w('Laden', 'Loading') : w('Entladen', 'Unloading')} · {stop.company || w('(Firma fehlt)', '(Company missing)')}</span><button type="button" className="button button--secondary" disabled={index === 0} onClick={() => moveStop(index, -1)} aria-label={`${w('Stelle nach oben', 'Move stop up')} ${index + 1}`}>↑</button><button type="button" className="button button--secondary" disabled={index === order.stops.length - 1} onClick={() => moveStop(index, 1)} aria-label={`${w('Stelle nach unten', 'Move stop down')} ${index + 1}`}>↓</button></li>)}</ol></details>
        {['loading', 'unloading'].map(type => <details open key={type}><summary>{type === 'loading' ? w('Ladestellen', 'Loading stops') : w('Entladestellen', 'Unloading stops')}</summary><div className="mail-order-stops">{order.stops.map((stop, index) => stop.type === type && <section className="mail-order-stop" key={stop.id || `${type}-${index}`}><div className="mail-order-section-heading"><h3>{w('Stelle', 'Stop')} {index + 1}: {stop.company || (type === 'loading' ? w('Ladestelle', 'Loading stop') : w('Entladestelle', 'Unloading stop'))}</h3><button className="button button--secondary" type="button" onClick={() => { changed(); setOrder(value => ({ ...value, stops: value.stops.filter((_, at) => at !== index) })) }}>{w('Entfernen', 'Remove')}</button></div><div className="mail-order-grid">{field(`stops.${index}.company`, 'Firma', 'Company', { required: true })}{field(`stops.${index}.street`, 'Straße und Hausnummer', 'Street and house number', { required: true })}{field(`stops.${index}.country`, 'Land (ISO-Code)', 'Country (ISO code)', { required: true })}{field(`stops.${index}.postalCode`, 'PLZ', 'Postal code', { required: true })}{field(`stops.${index}.city`, 'Ort', 'City', { required: true })}{field(`stops.${index}.date`, 'Datum', 'Date', { type: 'date', required: true })}{field(`stops.${index}.timeFrom`, 'Zeit von', 'Time from', { type: 'time' })}{field(`stops.${index}.timeUntil`, 'Zeit bis', 'Time until', { type: 'time' })}{field(`stops.${index}.fixed`, 'Fixtermin', 'Fixed appointment', { type: 'checkbox' })}{field(`stops.${index}.reference`, 'Lieferscheinnummer', 'Delivery note number')}{field(`stops.${index}.contactName`, 'Ansprechpartner', 'Contact')}{field(`stops.${index}.contactEmail`, 'E-Mail', 'Email', { type: 'email' })}{field(`stops.${index}.contactPhone`, 'Telefon', 'Phone')}{field(`stops.${index}.note`, 'Hinweise zur Stelle', 'Stop instructions', { multiline: true })}</div>
          <h4>{w('Waren an dieser Stelle', 'Goods at this stop')}</h4>{stop.goods.map((goods, goodsIndex) => <section className="mail-order-goods" key={goods.id || goodsIndex}><div className="mail-order-section-heading"><strong>{w('Warenposition', 'Goods item')} {goodsIndex + 1}</strong><button className="button button--secondary" type="button" onClick={() => update(`stops.${index}.goods`, stop.goods.filter((_, at) => at !== goodsIndex))}>{w('Entfernen', 'Remove')}</button></div><div className="mail-order-grid">{field(`stops.${index}.goods.${goodsIndex}.description`, 'Warenbezeichnung', 'Goods description', { required: true })}{field(`stops.${index}.goods.${goodsIndex}.quantity`, 'Menge / Kolli', 'Quantity / packages', { numeric: true })}{field(`stops.${index}.goods.${goodsIndex}.packaging`, 'Verpackung', 'Packaging')}{field(`stops.${index}.goods.${goodsIndex}.weightKg`, 'Bruttogewicht (kg)', 'Gross weight (kg)', { numeric: true })}{field(`stops.${index}.goods.${goodsIndex}.loadingMeters`, 'Lademeter', 'Loading metres', { numeric: true })}{field(`stops.${index}.goods.${goodsIndex}.lengthCm`, 'Länge (cm)', 'Length (cm)', { numeric: true })}{field(`stops.${index}.goods.${goodsIndex}.widthCm`, 'Breite (cm)', 'Width (cm)', { numeric: true })}{field(`stops.${index}.goods.${goodsIndex}.heightCm`, 'Höhe (cm)', 'Height (cm)', { numeric: true })}{field(`stops.${index}.goods.${goodsIndex}.volumeM3`, 'Volumen (m³)', 'Volume (m³)', { numeric: true })}</div></section>)}<button className="button button--secondary" type="button" onClick={() => update(`stops.${index}.goods`, [...stop.goods, makeGoods()])}>{w('Warenposition hinzufügen', 'Add goods item')}</button></section>)}<button className="button button--secondary" type="button" onClick={() => { changed(); setOrder(value => ({ ...value, stops: [...value.stops, makeStop(type)] })) }}>{type === 'loading' ? w('Ladestelle hinzufügen', 'Add loading stop') : w('Entladestelle hinzufügen', 'Add unloading stop')}</button></div></details>)}
        <details open><summary>{w('Preis und Hinweise', 'Price and instructions')}</summary><div className="mail-order-grid">{field('price', 'Frachtpreis (netto)', 'Freight price (net)', { numeric: true, required: true })}{field('currency', 'Währung (DyCoS: EUR)', 'Currency (DyCoS: EUR)', { required: true })}{field('instructions', 'Vorschriften', 'Transport instructions', { multiline: true })}{field('dispatchNote', 'Dispositionshinweise', 'Dispatch notes', { multiline: true })}</div>{empty(order.price) && <label className="mail-order-checkbox"><input type="checkbox" checked={allowMissingPrice} onChange={event => { changed(); setAllowMissingPrice(event.target.checked) }} />{w('Ich bestätige ausdrücklich die Erfassung ohne Frachtpreis.', 'I explicitly confirm capture without a freight price.')}</label>}</details>
        <details open><summary>{w('Original-PDF und Freigabe', 'Original PDF and approval')}</summary><label className="form-field"><span>{w('Original-Auftragsbeleg für die XML *', 'Original order PDF to embed in XML *')}</span><select value={originalAttachmentId} onChange={event => { changed(); setOriginalAttachmentId(event.target.value) }}><option value="">{w('Original-PDF auswählen', 'Select original PDF')}</option>{attachments.filter(item => selectedPdfIds?.includes(item.id)).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><p className="mailbox-hint">{w('Das gewählte Original-PDF wird unverändert in die XML eingebettet.', 'The selected original PDF is embedded unchanged in the XML.')}</p>{!attachments.length && <p className="mail-order-label--missing">{w('Kein auswertbares Original-PDF vorhanden. Ein XML-Export mit Originalbeleg ist nicht möglich.', 'No readable original PDF is available. XML export with the original document is unavailable.')}</p>}
        {issues.length > 0 && <div className="mail-order-validation" role="status"><strong>{errors.length ? w('Vor dem Export ergänzen oder korrigieren:', 'Complete or correct before export:') : w('Hinweise prüfen:', 'Review notes:')}</strong><ul>{issues.map((item, index) => <li className={item.severity === 'error' ? 'mail-order-label--missing' : 'mail-order-label--warning'} key={`${item.path}-${index}`}><OrderMessage source={item.message} /></li>)}</ul></div>}
        <label className="mail-order-checkbox"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />{w('Ich habe Auftragsdaten, Frachtzahler, fehlende Angaben und Original-PDF geprüft und bestätige den XML-Download.', 'I have reviewed the order data, freight payer, missing information and original PDF and confirm the XML download.')}</label><div className="mail-order-footer">{notice && <p className="mail-order-notice" role="status">{notice}</p>}<button className="button" type="submit" disabled={Boolean(busy) || !canExport}>{busy === 'export' ? w('XML wird erstellt …', 'Creating XML …') : w('Speichern und XML herunterladen', 'Save and download XML')}</button>{dirty && <small>{w('Schließen erhält deine Eingaben in dieser Browsersitzung.', 'Closing preserves your input in this browser session.')}</small>}</div><Link to="/kunden-unternehmer">{w('Zur Stammdatenverwaltung', 'Open master data management')}</Link></details>
      </fieldset></form>}
      </div>
    </MailWorkDialog>
  </>
}
