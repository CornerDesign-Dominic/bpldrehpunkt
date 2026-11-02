import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../auth/useAuth.js'
import { useLanguage } from '../../i18n/useLanguage.js'
import { mailboxCall } from '../../lib/mailboxes.js'
import { parseRecipients, recipientText } from '../../lib/mailboxHelpers.js'
import { syncDraftCacheGuard, unsavedDrafts } from '../../lib/mailboxDraftCache.js'
import Toast from '../ui/Toast.jsx'
import MailActionButton from './MailActionButton.jsx'

const EMPTY = { to: '', cc: '', bcc: '', subject: '', body: '' }
const DRAFT_ID = 'compose:new'

export default function MailComposeAction({ connection, dirtyRef }) {
  const { user } = useAuth()
  const { language } = useLanguage()
  const w = (de, en) => language === 'en' ? en : de
  const identity = { connectionId: connection.id, messageId: DRAFT_ID }
  const cacheKey = `${user?.uid}:${connection.id}:${DRAFT_ID}`
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(EMPTY)
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [unknown, setUnknown] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [toast, setToast] = useState('')
  const [retry, setRetry] = useState(0)
  const [saved, setSaved] = useState(JSON.stringify(EMPTY))
  const dialog = useRef(null)
  const revision = useRef(0)
  const operation = useRef(null)
  const inFlight = useRef(false)
  const active = useRef(true)
  const dismissToast = useCallback(() => setToast(''), [])
  const dirty = JSON.stringify(draft) !== saved

  useEffect(() => {
    active.current = true
    return () => { active.current = false; dirtyRef.current = false }
  }, [dirtyRef])
  useEffect(() => {
    if (!open) return
    const element = dialog.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    element.showModal()
    return () => { element.close(); document.body.style.overflow = previousOverflow }
  }, [open])
  useEffect(() => {
    if (!open) return
    let current = true
    mailboxCall('getMailboxDraft', identity).then(async ({ draft: stored }) => {
      if (!current) return
      const accepted = stored?.sendStatus === 'accepted'
      if (accepted) {
        const result = await mailboxCall('saveMailboxDraft', { ...identity, draft: { toRecipients: [], ccRecipients: [], bccRecipients: [], subject: '', body: '', revision: stored.revision } })
        stored = result.draft
      }
      if (!current) return
      const initial = stored ? { to: recipientText(stored.toRecipients), cc: recipientText(stored.ccRecipients), bcc: recipientText(stored.bccRecipients), subject: stored.subject || '', body: stored.body || '' } : EMPTY
      const cached = accepted ? null : unsavedDrafts.get(cacheKey)
      revision.current = cached?.revision ?? stored?.revision ?? 0
      operation.current = stored?.operationId || null
      setUnknown(Boolean(stored?.sendStatus && stored.sendStatus !== 'accepted'))
      setDraft(cached?.draft || initial); setSaved(cached?.saved || JSON.stringify(initial)); setReady(true)
    }).catch(() => {
      if (current) setError(w('Mailentwurf konnte nicht geladen werden. Bitte erneut versuchen.', 'Could not load email draft. Please try again.'))
    }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  // The draft is scoped to this mailbox and reloaded whenever its dialog opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, retry, connection.id, cacheKey])

  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty, dirtyRef])

  function update(field, value) {
    const next = { ...draft, [field]: value }
    setDraft(next); setNotice('')
    if (JSON.stringify(next) !== saved) unsavedDrafts.set(cacheKey, { draft: next, saved, revision: revision.current })
    else unsavedDrafts.delete(cacheKey)
    syncDraftCacheGuard()
    dirtyRef.current = JSON.stringify(next) !== saved
  }
  function payload() {
    return { subject: draft.subject.trim(), body: draft.body, toRecipients: parseRecipients(draft.to), ccRecipients: parseRecipients(draft.cc), bccRecipients: parseRecipients(draft.bcc), revision: revision.current }
  }
  function prepareLoading() { setLoading(true); setReady(false); setError(''); setNotice('') }
  async function submit(send) {
    if (inFlight.current || !ready || unknown) return
    let value
    setError(''); setNotice('')
    try {
      value = payload()
      if (send && (!value.toRecipients.length || !value.subject || !value.body.trim())) throw new Error('empty')
    } catch {
      setError(w('Bitte Empfänger, Betreff und Nachricht prüfen. Adressen mit Semikolon trennen.', 'Check recipients, subject and message. Separate addresses with semicolons.'))
      return
    }
    inFlight.current = true; setBusy(true)
    try {
      const result = await mailboxCall('saveMailboxDraft', { ...identity, draft: value })
      revision.current = result.draft.revision
      if (!active.current) return
      unsavedDrafts.delete(cacheKey); syncDraftCacheGuard(); setSaved(JSON.stringify(draft)); dirtyRef.current = false
      if (!send) { setNotice(w('Entwurf gespeichert.', 'Draft saved.')); return }
      operation.current ||= crypto.randomUUID()
      const sent = await mailboxCall('sendMailboxMessage', { connectionId: connection.id, ...value, revision: revision.current, operationId: operation.current })
      if (!active.current) return
      if (sent.status !== 'accepted') { setUnknown(true); return }
      operation.current = null
      setDraft(EMPTY); setSaved(JSON.stringify(EMPTY)); setOpen(false)
      setToast(w('Mail gesendet.', 'Email sent.'))
    } catch (failure) {
      if (!active.current) return
      const definite = ['functions/invalid-argument', 'functions/permission-denied', 'functions/failed-precondition', 'functions/aborted', 'functions/already-exists', 'functions/unauthenticated'].includes(failure?.code)
      if (operation.current && !definite) setUnknown(true)
      else {
        operation.current = null
        setError(failure?.code === 'functions/permission-denied' ? w('Versand nicht erlaubt. In Dev sind nur Empfänger mit @brennpunkt-logistik.de erlaubt. Prüfe auch die Postfachberechtigung.', 'Sending is not allowed. Dev permits only @brennpunkt-logistik.de recipients. Also check mailbox permissions.') : failure?.code === 'functions/aborted' ? w('Der Entwurf wurde in einem anderen Fenster geändert. Dein Text bleibt erhalten. Bitte den aktuellen Stand neu laden.', 'The draft changed in another window. Your text is preserved. Reload the current version.') : w('Die Mail konnte nicht gespeichert oder gesendet werden. Dein Text bleibt erhalten.', 'Could not save or send the email. Your text is preserved.'))
      }
    } finally { inFlight.current = false; if (active.current) setBusy(false) }
  }
  const locked = loading || busy || !ready || unknown
  return <>
    <MailActionButton kind="compose" onClick={() => { prepareLoading(); setOpen(true) }} expanded={open} disabled={busy} hint={dirty ? w('Entwurf vorhanden', 'Draft available') : undefined}>{w('Mail schreiben', 'Write email')}</MailActionButton>
    <dialog ref={dialog} className="mailbox-reply-dialog mailbox-compose-dialog" aria-label={w('Mail schreiben', 'Write email')} onCancel={event => { event.preventDefault(); if (!busy) setOpen(false) }}>
      <div className="mailbox-panel-heading mailbox-reply-dialog__heading"><h2>{w('Mail schreiben', 'Write email')}</h2><button type="button" disabled={busy} onClick={() => setOpen(false)}>{w('Schließen', 'Close')}</button></div>
      <div className="mailbox-compose-fields" aria-busy={loading || busy}>
        <p className="mailbox-compose-sender">{w('Von', 'From')}: <strong>{connection.email}</strong></p>
        {loading && <p role="status">{w('Entwurf wird geladen …', 'Loading draft …')}</p>}
        {error && <div className="mailbox-error" role="alert"><p>{error}</p>{!ready && !loading && <button type="button" onClick={() => { prepareLoading(); setRetry(value => value + 1) }}>{w('Erneut versuchen', 'Try again')}</button>}</div>}
        {['to', 'cc', 'bcc'].map(field => <label className="mailbox-recipient-field" key={field}><span>{field === 'to' ? w('An', 'To') : field.toUpperCase()}</span><input type="text" autoComplete="off" disabled={locked} value={draft[field]} onChange={event => update(field, event.target.value)} /></label>)}
        <label className="mailbox-recipient-field"><span>{w('Betreff', 'Subject')}</span><input type="text" maxLength={255} disabled={locked} value={draft.subject} onChange={event => update('subject', event.target.value)} /></label>
        <label>{w('Nachricht', 'Message')}<textarea rows={12} maxLength={100000} disabled={locked} value={draft.body} onChange={event => update('body', event.target.value)} /></label>
        {unknown && <div className="mailbox-error" role="alert">{w('Versandstatus unklar. Bitte in Outlook unter „Gesendete Elemente“ prüfen. Erneutes Senden ist zum Schutz vor Doppelversand gesperrt.', 'Sending status is unclear. Check Sent Items in Outlook. Sending again is blocked to prevent duplicates.')}</div>}
        {notice && <p role="status">{notice}</p>}
        <div className="mailbox-reply-buttons mailbox-reply-buttons--send"><button type="button" disabled={locked || !dirty} onClick={() => submit(false)}>{w('Entwurf speichern', 'Save draft')}</button><button type="button" disabled={locked} onClick={() => submit(true)}>{busy ? w('Bitte warten …', 'Please wait …') : w('Mail senden', 'Send email')}</button></div>
      </div>
    </dialog>
    {toast && createPortal(<Toast message={toast} onDismiss={dismissToast} />, document.body)}
  </>
}
