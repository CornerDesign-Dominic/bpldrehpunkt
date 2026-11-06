import { useAuth } from '../../auth/useAuth.js'
import { canStartMailboxAction } from '../../lib/mailboxActionPermissions.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { MAIL_TRIAGE_ACTIONS, MAIL_TRIAGE_REJECTION_REASONS } from '../../../shared/mailboxTriage.js'
import { useLanguage } from '../../i18n/useLanguage.js'
import { MailboxTriageContext } from '../../mailboxes/MailboxTriageContext.js'
import { createMailboxTriageGate } from '../../lib/mailboxTriageGate.js'
import { mailboxCall } from '../../lib/mailboxes.js'
import MailTriageSummary from './MailTriageSummary.jsx'
import '../../styles/mailTriagePreview.css'

const actionNames = {
  tracking: ['Status aktualisieren', 'Update status'], order: ['Auftrag erfassen', 'Capture order'], invoice: ['Rechnungsprüfung', 'Invoice review'], terms: ['AGB prüfen', 'Review terms'], todo: ['To-do', 'To-do'], damage: ['Schaden', 'Damage'], collection: ['Inkasso', 'Collection'], court: ['Gericht / Streit', 'Court / dispute'], calendar: ['Kalender', 'Calendar'],
}

export default function MailboxTriageProvider({ identity, decision, decisionState, recommended = [], children }) {
  const { language } = useLanguage()
  const { profile } = useAuth()
  const en = language === 'en', w = (de, english) => en ? english : de
  const [pending, setPending] = useState(null), [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState(''), [correctKind, setCorrectKind] = useState(''), [comment, setComment] = useState(''), [missed, setMissed] = useState(false)
  const [saving, setSaving] = useState(false), [error, setError] = useState('')
  const dialog = useRef(null), gate = useRef(null), alive = useRef(false), requestRef = useRef(null), approved = useRef(new Set())
  useEffect(() => {
    alive.current = true
    const confirmations = approved.current
    // Recreate after StrictMode cleanup, which must cancel pending requests.
    gate.current = createMailboxTriageGate(value => { requestRef.current = value; setPending(value) })
    return () => { alive.current = false; confirmations.clear(); gate.current.dispose() }
  }, [])
  const ask = useCallback((kind, execute) => {
    setRejecting(false); setReason(''); setCorrectKind(''); setComment(''); setMissed(false); setError('')
    return gate.current.request(kind, execute, { decision, decisionState, recommended: recommended.includes(kind) })
  }, [decision, decisionState, recommended])
  const requestStart = useCallback((kind, execute) => {
    if (approved.current.delete(kind)) return execute()
    return ask(kind, execute)
  }, [ask])
  const previewAction = useCallback((kind, activate) => {
    approved.current.delete(kind)
    return ask(kind, () => { approved.current.add(kind); return activate() })
  }, [ask])
  const pendingId = pending?.id
  useEffect(() => {
    if (!pendingId) return
    const element = dialog.current
    const previous = document.activeElement
    element.showModal()
    return () => { element.close(); previous?.focus?.() }
  }, [pendingId])
  const busy = saving || pending?.running
  function cancel() { if (!busy) gate.current.cancel(pending?.id) }
  async function submit(outcome) {
    if (!pending || busy) return
    const id = pending.id, kind = pending.kind
    if (outcome === 'rejected' && (!reason || reason === 'other_action' && !correctKind || reason === 'other' && !comment.trim())) {
      setError(w('Bitte einen Grund und gegebenenfalls die richtige Aktion angeben.', 'Please provide a reason and, where needed, the correct action.')); return
    }
    setSaving(true); setError('')
    try {
      await mailboxCall('submitMailboxTriageFeedback', { ...identity, kind, outcome, reason: outcome === 'missed' ? 'other_action' : reason, ...((outcome === 'missed' || reason === 'other_action') ? { correctKind: outcome === 'missed' ? kind : correctKind } : {}), comment, ...(pending.metadata.decision?.version ? { decisionVersion: pending.metadata.decision.version } : {}), ...(pending.metadata.decision?.id ? { decisionId: pending.metadata.decision.id } : {}) })
      if (!alive.current || requestRef.current?.id !== id) return
      window.dispatchEvent(new Event('drehpunkt:mail-recommendations-changed'))
      if (outcome === 'rejected') gate.current.cancel(id)
      else await gate.current.confirm(id)
    } catch {
      if (alive.current && requestRef.current?.id === id) setError(w('Die Rückmeldung konnte nicht gespeichert werden. Bitte erneut versuchen.', 'Could not save the feedback. Please try again.'))
    } finally { if (alive.current) setSaving(false) }
  }
  async function start() {
    if (!pending || busy) return
    if (missed) await submit('missed')
    else await gate.current.confirm(pending.id)
  }
  const name = kind => actionNames[kind]?.[en ? 1 : 0] || kind
  return <MailboxTriageContext.Provider value={{ requestStart, previewAction }}>{children}{pending && <dialog ref={dialog} className="mail-triage-dialog" aria-labelledby="mail-triage-title" onCancel={event => { event.preventDefault(); cancel() }}>
    <header><h2 id="mail-triage-title">{w('Maileinordnung', 'Mail classification')}: {name(pending.kind)}</h2><button type="button" disabled={busy} onClick={cancel}>{w('Schließen', 'Close')}</button></header>
    <MailTriageSummary decision={pending.metadata.decision} decisionState={pending.metadata.decisionState} />
    {pending.metadata.decision?.actions?.filter(action => action.kind === pending.kind).map(action => <details key={action.kind}><summary>{w('Warum diese Aktion?', 'Why this action?')}</summary><p>{action.reason}</p>{action.quote && <blockquote>{action.quote}</blockquote>}</details>)}
    {!pending.metadata.recommended && !rejecting && <label className="mail-triage-missed"><input type="checkbox" checked={missed} onChange={event => setMissed(event.target.checked)} disabled={busy} />{w('Diese Aktion hätte empfohlen werden sollen', 'This action should have been recommended')}</label>}
    {rejecting && <div className="mail-triage-feedback"><label>{w('Grund', 'Reason')}<select value={reason} onChange={event => setReason(event.target.value)} disabled={busy}><option value="">{w('Bitte wählen', 'Please select')}</option>{MAIL_TRIAGE_REJECTION_REASONS.map(item => <option key={item.id} value={item.id}>{item[en ? 'en' : 'de']}</option>)}</select></label>
      {reason === 'other_action' && <label>{w('Richtige Aktion', 'Correct action')}<select value={correctKind} onChange={event => setCorrectKind(event.target.value)} disabled={busy}><option value="">{w('Bitte wählen', 'Please select')}</option>{MAIL_TRIAGE_ACTIONS.filter(kind => kind !== pending.kind && canStartMailboxAction(profile, kind)).map(kind => <option key={kind} value={kind}>{name(kind)}</option>)}</select></label>}
      <label>{w('Ergänzung', 'Comment')}<textarea maxLength={2000} value={comment} onChange={event => setComment(event.target.value)} disabled={busy} /></label>
    </div>}
    {error && <p role="alert" className="mailbox-action-error">{error}</p>}
    <footer>{rejecting ? <><button type="button" disabled={busy} onClick={() => setRejecting(false)}>{w('Zurück', 'Back')}</button><button type="button" disabled={busy} onClick={() => void submit('rejected')}>{w('Verwerfen und Grund speichern', 'Discard and save reason')}</button></> : <>{pending.metadata.recommended && <button type="button" disabled={busy} onClick={() => setRejecting(true)}>{w('Empfehlung verwerfen', 'Discard recommendation')}</button>}<button type="button" className="button button--primary" disabled={busy} onClick={() => void start()}>{busy ? w('Wird gestartet …', 'Starting …') : w('Aktion starten', 'Start action')}</button></>}</footer>
  </dialog>}</MailboxTriageContext.Provider>
}
