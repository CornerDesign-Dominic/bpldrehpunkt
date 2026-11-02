import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { FiList, FiPlus, FiSearch } from 'react-icons/fi'
import { useAuth } from '../../auth/useAuth.js'
import { useLanguage } from '../../i18n/useLanguage.js'
import { canView } from '../../lib/permissions.js'
import { listBusinessPartners } from '../../lib/businessPartners.js'
import { businessPartnerRoles } from '../../../shared/businessPartnerRoles.js'
import { mailboxRecordKinds } from '../../../shared/mailboxRecordFields.js'
import { useMailboxAction } from '../../mailboxes/useMailboxAction.js'
import { mailboxCall } from '../../lib/mailboxes.js'
import MailActionButton from './MailActionButton.jsx'
import MailWorkDialog from './MailWorkDialog.jsx'
import MailDocumentSources from './MailDocumentSources.jsx'
import MailboxAttachmentList from './MailboxAttachmentList.jsx'
import Toast from '../ui/Toast.jsx'
import '../../styles/mailboxRecords.css'

const labelOf = value => ({ low: 'Gering', medium: 'Mittel', high: 'Hoch', true: 'Ja', false: 'Nein' })[value] || value
const isPdf = file => file.contentType?.split(';')[0].toLowerCase() === 'application/pdf' || /\.pdf$/i.test(file.name || '')
function RecordTargets({ records, config, onSelect }) {
  return <div className="mail-record-targets">{records.map(record => <button type="button" key={record.path} onClick={() => onSelect(record)}><strong>{record.title}</strong>{record.reasons?.length > 0 && <small>Treffer: {record.reasons.map(reason => config.fields.find(field => field.key === reason)?.label || (reason === 'caseNumber' ? 'Fallnummer' : reason)).join(', ')}</small>}</button>)}</div>
}
function InvoiceDraftFields({ rows, onChange, disabled }) {
  const change = (index, key, value) => onChange(rows.map((row, i) => i === index ? { ...row, [key]: value } : row))
  return <section className="mail-record-invoices"><h4>Rechnungen zum Inkassofall hinzufügen</h4><p className="mailbox-hint">Die Forderung wird aus diesen Rechnungen berechnet. Bestehende Rechnungen und Zahlungen werden nicht überschrieben. Unvollständige Zeilen bitte ergänzen oder abwählen.</p>{rows.map((row, index) => <div className="mail-record-field" key={index}><label className="mail-record-field-heading"><input type="checkbox" checked={row.enabled} disabled={disabled} onChange={event => change(index, 'enabled', event.target.checked)} />Rechnung {index + 1} übernehmen</label><label>Rechnungsnummer<input aria-label={`Rechnungsnummer ${index + 1}`} type="text" value={row.invoiceNumber} maxLength={240} disabled={disabled || !row.enabled} onChange={event => change(index, 'invoiceNumber', event.target.value)} /></label>{[['netAmount', 'Netto'], ['vatAmount', 'USt.-Betrag']].map(([key, label]) => <label key={key}>{label}<input aria-label={`${label} Rechnung ${index + 1}`} type="number" step="0.01" min="0" value={row[key]} disabled={disabled || !row.enabled} onChange={event => change(index, key, event.target.value)} /></label>)}{row.evidence && <details className="mail-record-evidence"><summary>Quelle</summary>{Object.values(row.evidence).map((entry, i) => <p key={i}>{entry.source}: {entry.quote}</p>)}</details>}</div>)}<button type="button" disabled={disabled || rows.length >= 50} onClick={() => onChange([...rows, { invoiceNumber: '', netAmount: '', vatAmount: '', enabled: true }])}>Rechnung ergänzen</button></section>
}
export default function MailRecordAction({ kind, identity, mailContent, attachments = [] }) {
  const { user, profile } = useAuth()
  const { language } = useLanguage()
  const w = (de, en) => language === 'en' ? en : de
  const config = mailboxRecordKinds[kind]
  const masterDataAccess = canView(profile, 'masterData')
  const action = useMailboxAction(identity, kind)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('')
  const [target, setTarget] = useState(null)
  const [values, setValues] = useState({})
  const [selected, setSelected] = useState([])
  const [note, setNote] = useState('')
  const [manual, setManual] = useState(false)
  const [view, setView] = useState('suggestions')
  const [search, setSearch] = useState('')
  const [records, setRecords] = useState([])
  const [nextCursor, setNextCursor] = useState(null)
  const [searchBusy, setSearchBusy] = useState(false)
  const [calendarId, setCalendarId] = useState('')
  const [partners, setPartners] = useState([])
  const [partnerChoice, setPartnerChoice] = useState('')
  const [invoices, setInvoices] = useState([])
  const [acceptWarnings, setAcceptWarnings] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [localReceipt, setLocalReceipt] = useState(null)
  const active = useRef(true), searchGeneration = useRef(0)
  const openedJob = useRef(null)
  const drafts = useRef({})
  useEffect(() => { const generation = searchGeneration; active.current = true; return () => { active.current = false; ++generation.current } }, [])
  useEffect(() => {
    if (!open || kind !== 'collection' || !masterDataAccess) return
    let current = true
    listBusinessPartners().then(result => { if (current) setPartners(result.filter(partner => !partner.mergedIntoPartnerId && partner.status !== 'merged')) }).catch(() => { if (current) setError('Unternehmen konnten nicht geladen werden. Bitte später erneut öffnen.') })
    return () => { current = false }
  }, [open, kind, masterDataAccess])
  const analysis = action.result
  const receipt = action.completion || (localReceipt && localReceipt.jobId === action.jobId ? localReceipt.result : null)
  const completed = action.state === 'completed' || Boolean(receipt)
  async function click() {
    setError('')
    if (['idle', 'failed', 'discarded'].includes(action.state)) {
      try { await action.start() } catch { setError('Die Auswertung konnte nicht gestartet werden. Bitte erneut versuchen.') }
      return
    }
    if (openedJob.current !== action.jobId) {
      openedJob.current = action.jobId
      setMode(''); setTarget(null); setManual(false); setAcceptWarnings(false); setPartnerChoice('')
      setView('suggestions'); drafts.current = {}
      setSearch(''); setRecords([]); setNextCursor(null); ++searchGeneration.current; setSearchBusy(false)
      setCalendarId(analysis?.calendars?.find(calendar => calendar.id === `personal-${user?.uid}`)?.id || analysis?.calendars?.[0]?.id || '')
    }
    setOpen(true)
  }
  function rememberDraft() {
    if (mode && (view === 'create' || view === 'existing' && !manual)) drafts.current[target ? 'existing' : 'create'] = { mode, target, values, selected, invoices, note, calendarId, partnerChoice }
  }
  function showSelection(next) {
    if (next === view) return
    rememberDraft(); setView(next); setError('')
    if (next === 'suggestions') return
    const draft = drafts.current[next]
    if (draft) {
      setMode(draft.mode); setTarget(draft.target); setValues(draft.values); setSelected(draft.selected)
      setInvoices(draft.invoices); setNote(draft.note); setCalendarId(draft.calendarId); setPartnerChoice(draft.partnerChoice); setManual(false)
    } else if (next === 'create') choose()
    else { setManual(true); void find() }
  }
  function choose(record = null) {
    rememberDraft()
    const proposed = { ...(kind === 'calendar' && !record ? { allDay: analysis.values.startTime ? 'false' : 'true' } : {}), ...analysis.values }
    setTarget(record); setMode(record ? record.canUpdate === false ? 'note' : 'update' : 'create'); setManual(false)
    setView(record ? 'existing' : 'create')
    setValues({ ...(record?.values || {}), ...proposed })
    setSelected(config.fields.filter(field => proposed[field.key] !== undefined && String(proposed[field.key]) !== String(record?.values?.[field.key] ?? '') && !(kind === 'collection' && (['claimAmount', 'invoiceNumbers'].includes(field.key) || record?.linkedDebtor && field.key === 'debtorName'))).map(field => field.key))
    setInvoices((analysis.invoices || []).map(invoice => ({ ...invoice, enabled: true })))
    setNote((analysis.summary || '').slice(0, 3000)); setError('')
    if (record && kind === 'calendar') setCalendarId(record.path.split('/')[1])
  }
  async function find(cursor = null) {
    const generation = ++searchGeneration.current
    setSearchBusy(true); setError('')
    try {
      const result = await mailboxCall('searchMailboxRecordTargets', { ...identity, kind, search, ...(calendarId ? { calendarId } : {}), ...(cursor ? { cursor } : {}) })
      if (!active.current || generation !== searchGeneration.current) return
      setRecords(current => cursor ? [...current, ...result.records] : result.records); setNextCursor(result.nextCursor)
    } catch { if (active.current && generation === searchGeneration.current) setError('Einträge konnten nicht geladen werden. Bitte erneut suchen.') }
    finally { if (active.current && generation === searchGeneration.current) setSearchBusy(false) }
  }
  function update(key, value) { setValues(current => ({ ...current, [key]: value })); setSelected(current => current.includes(key) ? current : [...current, key]) }
  async function apply() {
    if (saving || completed) return
    setSaving(true); setError('')
    try {
      const partner = partnerChoice ? JSON.parse(partnerChoice) : []
      const result = await mailboxCall('applyMailboxRecord', { ...identity, kind, previewId: analysis.previewId, mode, values, invoices: invoices.filter(invoice => invoice.enabled), selectedFields: selected, note, acceptWarnings, ...(target ? { targetPath: target.path, targetVersion: target.version } : {}), ...(calendarId ? { calendarId } : {}), ...(partner.length ? { partnerId: partner[0], partnerRole: partner[1] } : {}) })
      if (!active.current) return
      setLocalReceipt({ jobId: action.jobId, result }); setOpen(false); setToast(`${config.label}: Angaben übernommen.`)
      await action.refresh().catch(() => {})
    } catch (failure) { if (active.current) setError(failure?.code === 'functions/aborted' ? 'Der Eintrag oder die Auswertung wurde inzwischen geändert. Bitte den Eintrag erneut auswählen und vergleichen.' : failure.message || 'Die Angaben konnten nicht übernommen werden.') }
    finally { if (active.current) setSaving(false) }
  }
  async function discard() {
    setSaving(true); setError('')
    try { await action.discard(); if (active.current) setOpen(false) } catch { if (active.current) setError('Der Vorschlag konnte nicht verworfen werden.') }
    finally { if (active.current) setSaving(false) }
  }
  const buttonText = action.state === 'running' ? `${config.label} wird ausgewertet` : completed ? `${config.label} übernommen` : action.state === 'review' ? `${config.label} prüfen` : config.label
  const otherFiles = attachments.filter(file => !isPdf(file) && (!file.isInline || !/(?:signatur|signature|logo|banner|facebook|linkedin|instagram|twitter|icon)/i.test(file.name || '')))
  const editing = view === 'create' || view === 'existing' && target && !manual
  return <>
    <MailActionButton kind={kind} state={completed ? 'completed' : action.state} expanded={open} disabled={action.busy || saving} onClick={() => void click()}>{buttonText}</MailActionButton>
    {!open && (error || action.error) && <p className="mailbox-action-error" role="alert">{error || action.error?.message}</p>}
    <MailWorkDialog open={open} id={`mail-record-${kind}`} title={`${config.label} aus Mail`} left={<MailDocumentSources identity={identity} attachments={attachments.filter(isPdf)} w={w} mailContent={<>{mailContent}<MailboxAttachmentList identity={identity} attachments={otherFiles} /></>} />} onClose={() => setOpen(false)} busy={saving} rightLoading={action.loadingResult} loadingLabel="Ergebnis wird geladen …">
      {error && <p className="mail-record-error" role="alert">{error}</p>}
      {completed ? <div className="mail-record-completed"><h3>{config.label}: abgeschlossen</h3><p>{receipt?.title || 'Die Angaben wurden bereits übernommen.'}</p>{receipt?.href && <Link to={receipt.href}>Eintrag öffnen</Link>}<p className="mailbox-hint">Herkunft: KI · durch Nutzer bestätigt</p>{receipt?.note && <p>{receipt.note}</p>}{config.fields.filter(field => Object.hasOwn(receipt?.acceptedValues || {}, field.key)).map(field => <div className={`mail-record-field${receipt.beforeValues ? ' has-comparison' : ''}`} key={field.key}><strong className="mail-record-field-heading">{field.label}</strong>{receipt.beforeValues && <div className="mail-record-previous"><small>Bisher</small><p>{String(receipt.beforeValues[field.key] ?? '') || '—'}</p></div>}<div className="mail-record-proposal"><small>Übernommen</small><p>{labelOf(String(receipt.acceptedValues[field.key] ?? '')) || '—'}</p></div></div>)}{receipt?.invoices?.length > 0 && <section><h4>Übernommene Rechnungen</h4>{receipt.invoices.map((invoice, index) => <p key={index}>{invoice.invoiceNumber} · Netto {invoice.netAmount} · USt. {invoice.vatAmount} · Brutto {invoice.grossAmount}</p>)}</section>}</div> : analysis && <div className="mail-record-workflow"><div className="mail-record-main">
        {analysis.warnings?.length > 0 && <div className="mail-record-warnings"><strong>Quellen prüfen</strong><ul>{analysis.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul><label><input type="checkbox" checked={acceptWarnings} onChange={event => setAcceptWarnings(event.target.checked)} />Hinweise geprüft; trotzdem mit den verfügbaren Angaben fortfahren.</label></div>}
        <div className="mail-record-selection"><h3>Was möchtest du machen?</h3><div className="mail-record-segments" role="group" aria-label="Vorgang auswählen">{[['create', 'Neu anlegen', FiPlus], ['suggestions', 'Vorschläge', FiList], ['existing', 'Bestehenden wählen', FiSearch]].map(([key, label, Icon]) => <button type="button" key={key} aria-pressed={view === key} disabled={saving} onClick={() => showSelection(key)}><Icon aria-hidden="true" /><span>{label}{key === 'suggestions' && analysis.candidates?.length > 0 && <span className="mail-record-count">{analysis.candidates.length}</span>}</span></button>)}</div></div>
        {kind !== 'todo' && <details className="mail-record-sources"><summary>Ausgewertete Quellen und OCR</summary><p>Mailtext{analysis.sourceFiles?.length ? ' und Anhänge:' : '.'}</p>{analysis.sourceFiles?.map((file, index) => <p key={index}>{file.name} · {['unsupported', 'unreadable'].includes(file.method) ? 'Nicht ausgewertet' : file.ocrPages?.length ? `${file.method === 'ocr_only' ? 'Nur OCR' : 'Text und OCR'} · Seiten ${file.ocrPages.join(', ')}` : file.method === 'image_analysis' ? 'Bild ausgewertet' : 'Text erkannt'}</p>)}</details>}
        {view === 'suggestions' && <section className="mail-record-choice"><h4>Passende bestehende Einträge</h4>{analysis.candidates?.length ? <RecordTargets records={analysis.candidates} config={config} onSelect={choose} /> : <p className="mailbox-hint">Keine passenden Einträge vorgeschlagen. Lege einen neuen Eintrag an oder wähle einen bestehenden über die Suche.</p>}{analysis.matchingLimited && <p className="mailbox-hint">Der automatische Abgleich ist begrenzt. Weitere Einträge findest du über „Bestehenden wählen“.</p>}</section>}
        {view === 'existing' && (manual || !target) && <section><h3>Bestehenden Eintrag auswählen</h3>{kind === 'calendar' && <label>Kalender<select value={calendarId} onChange={event => { setCalendarId(event.target.value); setRecords([]); setNextCursor(null) }}>{analysis.calendars.map(calendar => <option key={calendar.id} value={calendar.id}>{calendar.name}</option>)}</select></label>}<form className="mail-record-search" onSubmit={event => { event.preventDefault(); void find() }}><input aria-label="Einträge durchsuchen" value={search} onChange={event => setSearch(event.target.value)} maxLength={200} placeholder="Titel, Nummer, Aktenzeichen …" /><button type="submit" disabled={searchBusy}>Suchen</button></form>{<RecordTargets records={records} config={config} onSelect={choose} />}{searchBusy && <p role="status">Einträge werden geladen …</p>}{!searchBusy && !records.length && <p>Auf dieser Seite keine passenden Einträge.</p>}{nextCursor && <button type="button" disabled={searchBusy} onClick={() => void find(nextCursor)}>Weitere Einträge durchsuchen</button>}</section>}
        {editing && mode && <section className="mail-record-editor"><div className="mail-record-editor-heading"><div><strong>{mode === 'create' ? 'Neu anlegen' : target?.title}</strong>{target?.caseNumber && <p>{target.caseNumber}</p>}</div>{target && <button type="button" disabled={saving} onClick={() => { rememberDraft(); setManual(true); void find() }}>Eintrag wechseln</button>}</div>
          {mode === 'create' && kind === 'todo' && <p className="mailbox-hint">Die neue Aufgabe wird dir selbst zugewiesen.</p>}{target && <div className="mail-record-operation"><span>Was soll übernommen werden?</span><div className="mail-record-segments" role="group" aria-label="Übernahmeart">{[['update', 'Aktualisieren', target.canUpdate === false], ['note', 'Nur dokumentieren', false], ['close', kind === 'calendar' ? 'Termin absagen' : kind === 'damage' ? 'Wirtschaftlich erledigen' : 'Abschließen', target.canClose === false]].map(([key, label, unavailable]) => <button type="button" key={key} disabled={saving || unavailable} aria-pressed={mode === key} onClick={() => setMode(key)}>{label}</button>)}</div></div>}
          {mode === 'create' && kind === 'calendar' && <label>Drehpunkt-Kalender<select value={calendarId} onChange={event => setCalendarId(event.target.value)}>{analysis.calendars.map(calendar => <option key={calendar.id} value={calendar.id}>{calendar.name}</option>)}</select></label>}
          {mode === 'create' && kind === 'collection' && <label>Unternehmen aus den Stammdaten *<select value={partnerChoice} onChange={event => setPartnerChoice(event.target.value)}><option value="">Bitte auswählen</option>{partners.flatMap(partner => ['customer', 'carrier'].filter(role => businessPartnerRoles(partner)[role]).map(role => <option key={`${partner.id}-${role}`} value={JSON.stringify([partner.id, role])}>{partner.companyName} · {role === 'customer' ? 'Kunde' : 'Unternehmer'}</option>))}</select><small>Der gespeicherte Schuldner wird aus diesem Stammdatensatz übernommen.</small></label>}
          {['create', 'update'].includes(mode) && <><p className="mailbox-hint">KI-Vorschläge prüfen. {mode === 'update' ? 'Nur ausgewählte Felder werden verändert.' : 'Mit * markierte Angaben ergänzen.'}</p>{config.fields.map(field => {
            const linkedName = kind === 'collection' && (['claimAmount', 'invoiceNumbers'].includes(field.key) || field.key === 'debtorName' && (mode === 'create' || target?.linkedDebtor))
            const checked = selected.includes(field.key)
            const inputId = `record-${kind}-${field.key}`
            const input = field.type === 'textarea' ? <textarea id={inputId} rows={4} maxLength={4000} value={values[field.key] ?? ''} disabled={saving || linkedName} onChange={event => update(field.key, event.target.value)} /> : field.type === 'select' ? <select id={inputId} value={String(values[field.key] ?? '')} disabled={saving || linkedName} onChange={event => update(field.key, event.target.value)}><option value="">Nicht erkannt / bitte auswählen</option>{field.options.map(option => <option key={option} value={option}>{labelOf(option)}</option>)}</select> : <input id={inputId} type={field.type} step={field.type === 'number' ? '0.01' : undefined} min={field.type === 'number' ? '0' : undefined} maxLength={field.type === 'text' ? kind === 'calendar' && field.key === 'title' ? 160 : 240 : undefined} value={values[field.key] ?? ''} disabled={saving || linkedName} onChange={event => update(field.key, event.target.value)} />
            return <div className={`mail-record-field${mode === 'update' ? ' has-comparison' : ''}`} key={field.key}><div className="mail-record-field-heading">{mode === 'update' && <input type="checkbox" aria-label={`${field.label} übernehmen`} checked={checked && !linkedName} disabled={saving || linkedName} onChange={event => setSelected(current => event.target.checked ? [...current, field.key] : current.filter(key => key !== field.key))} />}<label htmlFor={inputId}>{field.label}{mode === 'create' && field.required ? ' *' : ''}</label></div>{mode === 'update' && <div className="mail-record-previous"><small>Bisher</small><p>{labelOf(String(target.values[field.key] ?? '')) || '—'}</p></div>}<div className="mail-record-proposal">{mode === 'update' && <small>Vorschlag</small>}{input}{kind !== 'todo' && analysis.evidence?.[field.key] && <details className="mail-record-evidence"><summary>Quelle</summary><small>{analysis.evidence[field.key].source}</small><p>{analysis.evidence[field.key].quote}</p></details>}</div></div>
          })}{kind === 'collection' && <InvoiceDraftFields rows={invoices} onChange={setInvoices} disabled={saving} />}</>}
          <label>{mode === 'note' ? 'Hinweis zum bestehenden Eintrag' : 'Dokumentation zur Übernahme'}<textarea rows={4} maxLength={3000} value={note} disabled={saving} onChange={event => setNote(event.target.value)} /></label>
          {mode === 'close' && <p className="mail-record-warnings">{kind === 'calendar' ? 'Der Termin wird als abgesagt gekennzeichnet. Er wird nicht gelöscht.' : 'Der bestehende Vorgang wird als erledigt beziehungsweise abgeschlossen gekennzeichnet.'}</p>}
        </section>}
        </div><footer className="mail-record-footer"><button type="button" className="mail-record-discard" disabled={saving} onClick={() => void discard()}>Ergebnis verwerfen</button>{editing && mode && <button type="button" className="mail-record-apply" disabled={saving || analysis.warnings?.length > 0 && !acceptWarnings} onClick={() => void apply()}>{saving ? 'Wird gespeichert …' : mode === 'create' ? 'Neu anlegen' : 'Angaben übernehmen'}</button>}</footer></div>}
    </MailWorkDialog>
    {toast && createPortal(<Toast message={toast} onDismiss={() => setToast('')} />, document.body)}
  </>
}
