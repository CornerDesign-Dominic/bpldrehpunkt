import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.js'
import { useLanguage } from '../i18n/useLanguage.js'
import { canEdit } from '../lib/permissions.js'
import { mailboxCall } from '../lib/mailboxes.js'
import { attachmentBlob, createConnectionProof, parseRecipients, recipientAddress, recipientText, replyRecipients, safeAttachmentName, safeOutlookLink } from '../lib/mailboxHelpers.js'
import MailAttachmentPdf from '../components/mailboxes/MailAttachmentPdf.jsx'
import '../styles/mailboxes.css'

// Unsaved text survives SPA history navigation without persisting mail content
// to browser storage. Reload/closing is separately guarded by beforeunload.
const unsavedDrafts = new Map()
const pendingConnections = new Map()
let guardedDraftCache = false
let draftCacheOwner = null
function warnUnsavedDrafts(event) {
  if (!unsavedDrafts.size) return
  event.preventDefault()
  event.returnValue = ''
}
function syncDraftCacheGuard() {
  if (unsavedDrafts.size > 0 && !guardedDraftCache) {
    window.addEventListener('beforeunload', warnUnsavedDrafts)
    guardedDraftCache = true
  } else if (!unsavedDrafts.size && guardedDraftCache) {
    window.removeEventListener('beforeunload', warnUnsavedDrafts)
    guardedDraftCache = false
  }
}

function useWords() {
  const { language } = useLanguage()
  return (de, en) => language === 'en' ? en : de
}

function mailDate(value, language) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(language === 'en' ? 'en-GB' : 'de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' })
}

function Failure({ message, retry }) {
  const w = useWords()
  return <div className="mailbox-error" role="alert"><p>{message}</p>{retry && <button type="button" onClick={retry}>{w('Erneut versuchen', 'Try again')}</button>}</div>
}

export default function MailboxesPage() {
  const { user, profile } = useAuth()
  const w = useWords()
  const editable = canEdit(profile, 'mailboxes')
  const [params, setParams] = useSearchParams()
  const [connections, setConnections] = useState(null)
  const [error, setError] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [reload, setReload] = useState(0)
  const dirtyRef = useRef(false)
  const connectionId = params.get('mailbox') || ''
  const messageId = params.get('message') || ''
  const connection = connections?.find((item) => item.id === connectionId)
  const storageKey = `drehpunkt.mailboxes.last.${user?.uid}`
  const proofKey = `drehpunkt.mailboxes.proof.${user?.uid}`
  const pendingTicket = params.get('connection') === 'pending' ? params.get('ticket') : null

  useEffect(() => {
    if (draftCacheOwner && draftCacheOwner !== user?.uid) {
      unsavedDrafts.clear()
      syncDraftCacheGuard()
    }
    draftCacheOwner = user?.uid || null
  }, [user?.uid])

  useEffect(() => {
    if (!pendingTicket || !user?.uid) return
    let active = true
    async function finish() {
      let proof
      try { proof = sessionStorage.getItem(proofKey) } catch { /* Missing proof is handled explicitly below. */ }
      if (!proof) throw new Error('Missing connection proof')
      await mailboxCall('finishMailboxConnection', { ticket: pendingTicket, proof })
      sessionStorage.removeItem(proofKey)
    }
    // React StrictMode may mount twice. Share this one-time redemption request.
    const key = `${user.uid}:${pendingTicket}`
    if (!pendingConnections.has(key)) pendingConnections.set(key, finish())
    pendingConnections.get(key).then(() => {
      if (active) { setParams({ connection: 'success' }, { replace: true }); setReload((value) => value + 1) }
    }).catch(() => {
      if (active) { setError(w('Die Postfachverbindung konnte nicht bestätigt werden. Bitte starte die Verbindung in diesem Browser erneut.', 'Could not confirm the mailbox connection. Start the connection again in this browser.')); setParams({ connection: 'error' }, { replace: true }) }
    })
    return () => { active = false }
  // This effect redeems only the OAuth ticket in this tab and account.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTicket, user?.uid, proofKey, setParams])

  useEffect(() => {
    let active = true
    mailboxCall('listMailboxConnections').then(({ connections: items }) => {
      if (active) { setConnections(items); setError('') }
    }).catch(() => { if (active) setError(w('Postfächer konnten nicht geladen werden.', 'Could not load mailboxes.')) })
    return () => { active = false }
  // Reload only on explicit retry or account change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, user?.uid])

  useEffect(() => {
    if (!connections?.length || pendingTicket) return
    if (connectionId) {
      if (connection) {
        try { localStorage.setItem(storageKey, JSON.stringify({ mailbox: connectionId, message: messageId })) } catch { /* Remembering selection is optional. */ }
      }
      return
    }
    let last = null
    try { last = JSON.parse(localStorage.getItem(storageKey)) } catch { /* Invalid or unavailable preference. */ }
    const selected = connections.find((item) => item.id === last?.mailbox) || connections[0]
    setParams({ mailbox: selected.id, ...(selected.id === last?.mailbox && last?.message ? { message: last.message } : {}) }, { replace: true })
  }, [connections, connectionId, messageId, connection, storageKey, setParams, pendingTicket])

  function navigate(next) {
    if (dirtyRef.current && !window.confirm(w('Der Antwortentwurf ist noch nicht gespeichert. Trotzdem wechseln?', 'The reply draft has not been saved. Leave anyway?'))) return
    dirtyRef.current = false
    setParams(next)
  }

  async function connect() {
    if (dirtyRef.current && !window.confirm(w('Ungespeicherten Entwurf verlassen?', 'Leave the unsaved draft?'))) return
    setConnecting(true); setError('')
    try {
      const { proof, proofChallenge } = await createConnectionProof()
      sessionStorage.setItem(proofKey, proof)
      const { authorizationUrl } = await mailboxCall('beginMailboxConnection', { proofChallenge })
      const url = new URL(authorizationUrl)
      if (url.protocol !== 'https:' || url.hostname !== 'login.microsoftonline.com') throw new Error('Invalid authorization URL')
      window.location.assign(url.href)
    } catch { setError(w('Die Verbindung konnte nicht gestartet werden. Bitte die Einrichtung prüfen oder erneut versuchen.', 'Could not start the connection. Check setup or try again.')); setConnecting(false) }
  }

  async function disconnect() {
    if (!connection || !window.confirm(w('Dieses Postfach von Drehpunkt trennen? Ungespeicherte Änderungen werden verworfen. Nachrichten in Outlook bleiben erhalten.', 'Disconnect this mailbox from Drehpunkt? Unsaved changes will be discarded. Messages in Outlook remain.'))) return
    setConnecting(true); setError('')
    try {
      await mailboxCall('disconnectMailbox', { connectionId: connection.id })
      dirtyRef.current = false
      for (const key of unsavedDrafts.keys()) if (key.startsWith(`${user.uid}:${connection.id}:`)) unsavedDrafts.delete(key)
      syncDraftCacheGuard()
      try { localStorage.removeItem(storageKey) } catch { /* Optional selection preference. */ }
      setConnections((items) => items.filter((item) => item.id !== connection.id)); setParams({}, { replace: true })
    } catch { setError(w('Das Postfach konnte nicht getrennt werden. Bitte erneut versuchen.', 'Could not disconnect the mailbox. Please try again.')) }
    finally { setConnecting(false) }
  }

  return <section className="mailboxes-page">
    <header className="mailboxes-heading"><div><h1>{w('Postfächer', 'Mailboxes')}</h1><p>{w('Nachrichten lesen und direkt aus deinem Microsoft-Postfach antworten.', 'Read messages and reply from your Microsoft mailbox.')}</p></div>
      {editable && <button type="button" onClick={connect} disabled={connecting}>{connecting ? w('Verbindung wird gestartet …', 'Connecting …') : w('Microsoft-Postfach verbinden', 'Connect Microsoft mailbox')}</button>}
    </header>
    {params.get('connection') === 'success' && <p role="status">{w('Microsoft-Postfach wurde verbunden.', 'Microsoft mailbox connected.')}</p>}
    {pendingTicket && <p role="status">{w('Postfachverbindung wird bestätigt …', 'Confirming mailbox connection …')}</p>}
    {params.get('connection') === 'error' && <Failure message={w('Microsoft-Verbindung fehlgeschlagen. Bitte erneut verbinden.', 'Microsoft connection failed. Please connect again.')} />}
    {error && <Failure message={error} retry={() => setReload((value) => value + 1)} />}
    {!connections && !error && <p role="status">{w('Postfächer werden geladen …', 'Loading mailboxes …')}</p>}
    {connections?.length === 0 && <div className="mailbox-empty"><h2>{w('Noch kein Postfach verbunden', 'No mailbox connected')}</h2><p>{editable ? w('Verbinde dein Microsoft-Konto, um deinen Posteingang zu öffnen.', 'Connect your Microsoft account to open your inbox.') : w('Für das Verbinden eines Postfachs ist eine Bearbeitungsberechtigung erforderlich.', 'Editing permission is required to connect a mailbox.')}</p></div>}
    {Boolean(connections?.length) && <>
      <div className="mailbox-selector"><label>{w('Postfach', 'Mailbox')}<select value={connectionId} onChange={(event) => navigate({ mailbox: event.target.value })}>{!connection && <option value="">{w('Bitte auswählen', 'Select mailbox')}</option>}{connections.map((item) => <option key={item.id} value={item.id}>{item.displayName ? `${item.displayName} · ` : ''}{item.email}</option>)}</select></label>
        {connection?.status === 'disconnecting' && <span role="status">{w('Trennung noch nicht abgeschlossen. Bitte erneut „Verbindung trennen“ wählen.', 'Disconnection is incomplete. Select Disconnect again.')}</span>}
        {connection && editable && <button type="button" onClick={disconnect} disabled={connecting}>{w('Verbindung trennen', 'Disconnect')}</button>}
      </div>
      {connection && connection.status !== 'disconnecting' ? <div className="mailbox-layout">
        <Inbox key={connection.id} connectionId={connection.id} selectedId={messageId} onSelect={(id) => navigate({ mailbox: connection.id, message: id })} />
        {messageId ? <MailWorkspace key={`${user?.uid}:${connection.id}:${messageId}`} connection={connection} messageId={messageId} editable={editable} dirtyRef={dirtyRef} /> : <div className="mailbox-empty">{w('Wähle eine Nachricht aus dem Posteingang.', 'Select a message from the inbox.')}</div>}
      </div> : connection?.status !== 'disconnecting' && <p>{w('Dieses Postfach ist nicht verfügbar. Bitte wähle ein verbundenes Postfach.', 'This mailbox is unavailable. Select a connected mailbox.')}</p>}
    </>}
  </section>
}

function Inbox({ connectionId, selectedId, onSelect }) {
  const { language } = useLanguage()
  const w = useWords()
  const [messages, setMessages] = useState([])
  const [next, setNext] = useState(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const request = useRef(0)
  const retryPage = useRef(null)
  const load = useCallback(async (pageToken) => {
    const version = ++request.current
    retryPage.current = pageToken || null
    setBusy(true); setError('')
    try {
      const result = await mailboxCall('listMailboxMessages', { connectionId, ...(pageToken ? { pageToken } : {}) })
      if (version !== request.current) return
      setMessages((current) => pageToken ? [...new Map([...current, ...result.messages].map((item) => [item.id, item])).values()] : result.messages)
      setNext(result.nextPageToken || null)
    } catch { if (version === request.current) setError(w('Nachrichten konnten nicht geladen werden.', 'Could not load messages.')) }
    finally { if (version === request.current) setBusy(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId])
  useEffect(() => {
    const task = setTimeout(() => { void load() }, 0)
    // Invalidate outstanding requests after this inbox unmounts.
    const currentRequest = request
    return () => { clearTimeout(task); ++currentRequest.current }
  }, [load])
  return <aside className="mailbox-inbox" aria-label={w('Posteingang', 'Inbox')}><div className="mailbox-panel-heading"><h2>{w('Posteingang', 'Inbox')}</h2><button type="button" disabled={busy} onClick={() => load()}>{w('Aktualisieren', 'Refresh')}</button></div>
    {error && <Failure message={error} retry={() => load(retryPage.current)} />}
    <div className="mailbox-message-list">{messages.map((message) => <button className={`mailbox-message-item ${selectedId === message.id ? 'is-selected' : ''} ${message.isRead === false ? 'is-unread' : ''}`} type="button" key={message.id} onClick={() => onSelect(message.id)} aria-current={selectedId === message.id ? 'true' : undefined}>
      <span>{message.from?.emailAddress?.name || recipientAddress(message.from)}</span><strong>{message.subject || w('(Kein Betreff)', '(No subject)')}</strong><small>{mailDate(message.receivedDateTime, language)} {message.hasAttachments ? ' · 📎' : ''}</small><span className="mailbox-preview">{message.bodyPreview}</span>
    </button>)}</div>
    {busy && <p role="status">{w('Nachrichten werden geladen …', 'Loading messages …')}</p>}
    {!busy && !error && !messages.length && <p>{w('Der Posteingang ist leer.', 'The inbox is empty.')}</p>}
    {next && <button type="button" disabled={busy} onClick={() => load(next)}>{w('Weitere Nachrichten', 'More messages')}</button>}
  </aside>
}

function MailWorkspace({ connection, messageId, editable, dirtyRef }) {
  const { language } = useLanguage()
  const w = useWords()
  const [message, setMessage] = useState(null)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [focus, setFocus] = useState('mail')
  const [attachment, setAttachment] = useState(null)
  const [attachmentBusy, setAttachmentBusy] = useState('')
  const [attachmentError, setAttachmentError] = useState('')
  const attachmentRequest = useRef(0)
  const attachmentUrl = useRef(null)
  const identity = { connectionId: connection.id, messageId }
  useEffect(() => {
    let active = true
    mailboxCall('getMailboxMessage', { connectionId: connection.id, messageId }).then(({ message: item }) => { if (active) { setMessage(item); setError('') } }).catch(() => { if (active) setError(w('Diese Nachricht konnte nicht geladen werden. Sie wurde möglicherweise verschoben oder gelöscht.', 'Could not load this message. It may have been moved or deleted.')) })
    return () => { active = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.id, messageId, reload])
  useEffect(() => () => { ++attachmentRequest.current; if (attachmentUrl.current) URL.revokeObjectURL(attachmentUrl.current) }, [])

  async function openAttachment(item, download = false) {
    const version = ++attachmentRequest.current
    setAttachmentBusy(item.id); setAttachmentError('')
    try {
      const data = await mailboxCall('getMailboxAttachment', { ...identity, attachmentId: item.id })
      if (version !== attachmentRequest.current) return
      const blob = attachmentBlob(data)
      const url = URL.createObjectURL(blob)
      const name = safeAttachmentName(data.name || item.name)
      if (download || data.contentType?.split(';')[0].toLowerCase() !== 'application/pdf') {
        const link = document.createElement('a'); link.href = url; link.download = name; link.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      } else {
        if (attachmentUrl.current) URL.revokeObjectURL(attachmentUrl.current)
        attachmentUrl.current = url; setAttachment({ url, blob, name }); setFocus('mail')
      }
    } catch { if (version === attachmentRequest.current) setAttachmentError(w('Anhang konnte nicht geöffnet werden. Bitte erneut versuchen.', 'Could not open attachment. Please try again.')) }
    finally { if (version === attachmentRequest.current) setAttachmentBusy('') }
  }

  if (error) return <Failure message={error} retry={() => setReload((value) => value + 1)} />
  if (!message) return <p role="status">{w('Nachricht wird geladen …', 'Loading message …')}</p>
  return <div className={`mailbox-workspace mailbox-focus-${focus}`}>
    <article className="mailbox-reader"><div className="mailbox-panel-heading"><h2>{w('Nachricht', 'Message')}</h2>{editable && <button type="button" aria-pressed={focus === 'mail'} onClick={() => setFocus('mail')}>{w('Lesebereich vergrößern', 'Expand reading area')}</button>}</div>
      <h3>{message.subject || w('(Kein Betreff)', '(No subject)')}</h3><dl className="mailbox-metadata"><dt>{w('Von', 'From')}</dt><dd>{message.from?.emailAddress?.name} &lt;{recipientAddress(message.from)}&gt;</dd><dt>{w('An', 'To')}</dt><dd>{recipientText(message.toRecipients)}</dd>{message.ccRecipients?.length > 0 && <><dt>CC</dt><dd>{recipientText(message.ccRecipients)}</dd></>}<dt>{w('Datum', 'Date')}</dt><dd>{mailDate(message.receivedDateTime, language)}</dd></dl>
      <div className="mailbox-body">{message.body?.contentType?.toLowerCase() === 'html' ? w('Diese Nachricht konnte nicht sicher als Text dargestellt werden.', 'This message could not be safely displayed as text.') : message.body?.content || message.bodyPreview || w('(Leere Nachricht)', '(Empty message)')}</div>
      {message.attachments?.length > 0 && <section className="mailbox-attachments"><h3>{w('Anhänge', 'Attachments')}</h3>{message.attachments.map((item) => <div key={item.id}>
        <span>{item.name}</span>
        {item.supported === false ? <small>{w('Über 5 MB oder nicht unterstützter Anhang. Bitte über das Original in Outlook öffnen.', 'Over 5 MB or unsupported attachment. Open the original in Outlook.')}</small> : <>
          <button type="button" disabled={Boolean(attachmentBusy)} onClick={() => openAttachment(item)}>{attachmentBusy === item.id ? w('Lädt …', 'Loading …') : item.contentType?.toLowerCase() === 'application/pdf' ? w('PDF öffnen', 'Open PDF') : w('Herunterladen', 'Download')}</button>
          {item.contentType?.toLowerCase() === 'application/pdf' && <button type="button" disabled={Boolean(attachmentBusy)} onClick={() => openAttachment(item, true)}>{w('Herunterladen', 'Download')}</button>}
        </>}
      </div>)}</section>}
      {message.attachmentsTruncated && <p role="status">{w('Es sind weitere Anhänge vorhanden. Bitte öffne die vollständige Nachricht in Outlook.', 'More attachments exist. Open the complete message in Outlook.')}</p>}
      {safeOutlookLink(message.webLink) && <a href={safeOutlookLink(message.webLink)} target="_blank" rel="noopener noreferrer">{w('Original in Outlook öffnen', 'Open original in Outlook')}</a>}
      {attachmentError && <Failure message={attachmentError} />}
      {attachment && <section className="mailbox-pdf"><div className="mailbox-panel-heading"><strong>{attachment.name}</strong><button type="button" onClick={() => { URL.revokeObjectURL(attachmentUrl.current); attachmentUrl.current = null; setAttachment(null) }}>{w('Vorschau schließen', 'Close preview')}</button></div><MailAttachmentPdf key={attachment.url} blob={attachment.blob} name={attachment.name} /></section>}
    </article>
    {editable && <ReplyComposer identity={identity} message={message} ownEmail={connection.email} dirtyRef={dirtyRef} onFocus={() => setFocus('reply')} />}
  </div>
}

function ReplyComposer({ identity, message, ownEmail, dirtyRef, onFocus }) {
  const w = useWords()
  const { user } = useAuth()
  const cacheKey = `${user?.uid}:${identity.connectionId}:${identity.messageId}`
  const [draft, setDraft] = useState(null)
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [sendState, setSendState] = useState('')
  const [reload, setReload] = useState(0)
  const active = useRef(true)
  const operation = useRef(null)
  const revision = useRef(0)
  const dirty = Boolean(draft && JSON.stringify(draft) !== saved)

  useEffect(() => {
    let mounted = true
    active.current = true
    mailboxCall('getMailboxDraft', identity).then(({ draft: stored }) => {
      if (!mounted) return
      const initial = stored ? { to: recipientText(stored.toRecipients), cc: recipientText(stored.ccRecipients), bcc: recipientText(stored.bccRecipients), body: stored.body || '', replyAll: stored.replyAll === true } : { ...replyRecipients(message, ownEmail), body: '', replyAll: false }
      const cached = unsavedDrafts.get(cacheKey)
      setDraft(cached?.draft || initial); setSaved(cached?.saved || JSON.stringify(initial)); setError(''); setSendState(stored?.sendStatus || '')
      revision.current = cached?.revision ?? stored?.revision ?? 0
    }).catch(() => { if (mounted) setError(w('Antwortentwurf konnte nicht geladen werden. Bitte erneut versuchen.', 'Could not load reply draft. Please try again.')) })
    return () => { mounted = false; active.current = false; dirtyRef.current = false }
  // Message-scoped component remounts for each mail.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload])

  useEffect(() => {
    dirtyRef.current = dirty
    if (dirty) unsavedDrafts.set(cacheKey, { draft, saved, revision: revision.current })
    else if (draft) unsavedDrafts.delete(cacheKey)
    syncDraftCacheGuard()
  }, [dirty, dirtyRef, draft, saved, cacheKey])
  useEffect(() => {
    if (!dirty && !busy) return
    const unload = (event) => { event.preventDefault(); event.returnValue = '' }
    const click = (event) => {
      const anchor = event.target.closest('a[href]')
      if (anchor && anchor.target !== '_blank' && !event.ctrlKey && !event.metaKey && !window.confirm(w('Der Antwortentwurf ist noch nicht gespeichert. Trotzdem verlassen?', 'The reply draft has not been saved. Leave anyway?'))) { event.preventDefault(); event.stopPropagation() }
    }
    window.addEventListener('beforeunload', unload); document.addEventListener('click', click, true)
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', click, true) }
  }, [dirty, busy, w])

  function payload() {
    return { body: draft.body, replyAll: draft.replyAll, toRecipients: parseRecipients(draft.to), ccRecipients: parseRecipients(draft.cc), bccRecipients: parseRecipients(draft.bcc), revision: revision.current }
  }
  async function save() {
    setError(''); setNotice('')
    let value
    try { value = payload() } catch { setError(w('Bitte gültige E-Mail-Adressen eingeben, getrennt durch Semikolon.', 'Enter valid email addresses separated by semicolons.')); return }
    setBusy(true)
    const serialized = JSON.stringify(draft)
    try { const result = await mailboxCall('saveMailboxDraft', { ...identity, draft: value }); if (active.current) { revision.current = result.draft?.revision ?? revision.current + 1; unsavedDrafts.delete(cacheKey); syncDraftCacheGuard(); setSaved(serialized); setNotice(w('Entwurf gespeichert.', 'Draft saved.')) } }
    catch (error) { if (active.current) setError(error?.code === 'functions/aborted' ? w('Der Entwurf wurde in einem anderen Fenster geändert. Dein Text bleibt hier erhalten. Bitte beide Stände vor dem weiteren Bearbeiten vergleichen.', 'The draft changed in another window. Your text remains here. Compare both versions before continuing.') : w('Entwurf konnte nicht gespeichert werden. Dein Text bleibt hier erhalten.', 'Could not save draft. Your text remains here.')) }
    finally { if (active.current) setBusy(false) }
  }
  async function send() {
    setError(''); setNotice('')
    let value
    try {
      value = payload()
      if (!value.toRecipients.length || !value.body.trim()) throw new Error('empty')
    } catch { setError(w('Bitte Empfänger und Antworttext prüfen. Adressen mit Semikolon trennen.', 'Check recipients and reply text. Separate addresses with semicolons.')); return }
    setBusy(true)
    try {
      const savedResult = await mailboxCall('saveMailboxDraft', { ...identity, draft: value })
      revision.current = savedResult.draft?.revision ?? revision.current + 1
      operation.current ||= crypto.randomUUID()
      const result = await mailboxCall('sendMailboxReply', { ...identity, ...value, revision: revision.current, operationId: operation.current })
      if (!active.current) return
      setSendState(result.status)
      unsavedDrafts.delete(cacheKey); syncDraftCacheGuard()
      setSaved(JSON.stringify(draft)); dirtyRef.current = false
      setNotice(result.status === 'accepted' ? w('Microsoft hat die Antwort zum Versand angenommen.', 'Microsoft accepted the reply for sending.') : w('Versandstatus unklar. Bitte zuerst in Outlook unter „Gesendete Elemente“ prüfen und nicht erneut senden.', 'Sending status is unclear. Check Sent Items in Outlook before sending anything again.'))
    } catch (error) {
      if (active.current) {
        if (operation.current && !['functions/invalid-argument', 'functions/permission-denied', 'functions/failed-precondition', 'functions/aborted', 'functions/already-exists', 'functions/unauthenticated'].includes(error?.code)) { setSendState('unknown'); setError(w('Versandstatus unklar. Bitte in Outlook unter „Gesendete Elemente“ prüfen. Nicht erneut senden.', 'Sending status is unclear. Check Sent Items in Outlook. Do not send again.')) }
        else if (operation.current) {
          operation.current = null
          setError(w('Die Antwort wurde nicht gesendet. Bitte Berechtigungen, Empfänger und den aktuellen Entwurfsstand prüfen. Dein Text bleibt erhalten.', 'The reply was not sent. Check permissions, recipients and the current draft version. Your text remains here.'))
        }
        else setError(error?.code === 'functions/aborted' ? w('Der Entwurf wurde in einem anderen Fenster geändert. Es wurde keine Antwort gesendet. Dein Text bleibt erhalten.', 'The draft changed in another window. No reply was sent. Your text remains here.') : error?.code === 'functions/invalid-argument' ? w('Die Antwort wurde abgelehnt. Bitte Eingaben prüfen.', 'The reply was rejected. Check your input.') : w('Entwurf konnte vor dem Versand nicht gespeichert werden. Der Text bleibt erhalten.', 'Could not save draft before sending. Your text remains here.'))
      }
    } finally { if (active.current) setBusy(false) }
  }
  function changeDraft(next) {
    if (JSON.stringify(next) !== saved) unsavedDrafts.set(cacheKey, { draft: next, saved, revision: revision.current })
    else unsavedDrafts.delete(cacheKey)
    syncDraftCacheGuard()
    dirtyRef.current = JSON.stringify(next) !== saved
    setDraft(next)
  }
  function update(field, value) { changeDraft({ ...draft, [field]: value }); setNotice('') }
  const locked = busy || ['accepted', 'unknown', 'sending'].includes(sendState)
  return <aside className="mailbox-reply"><div className="mailbox-panel-heading"><h2>{w('Antworten', 'Reply')}</h2><button type="button" onClick={onFocus}>{w('Schreibbereich vergrößern', 'Expand writing area')}</button></div>
    {error && <Failure message={error} retry={!draft ? () => setReload((value) => value + 1) : undefined} />}
    {!draft && !error && <p role="status">{w('Entwurf wird geladen …', 'Loading draft …')}</p>}
    {draft && <><label className="mailbox-reply-mode"><input type="checkbox" checked={draft.replyAll} disabled={locked} onChange={(event) => {
      const replyAll = event.target.checked
      if ((draft.to !== replyRecipients(message, ownEmail, draft.replyAll).to || draft.cc !== replyRecipients(message, ownEmail, draft.replyAll).cc) && !window.confirm(w('Empfänger durch die Auswahl für diesen Antwortmodus ersetzen?', 'Replace recipients with those for this reply mode?'))) return
      changeDraft({ ...draft, ...replyRecipients(message, ownEmail, replyAll), bcc: draft.bcc, replyAll })
    }} />{w('Allen antworten', 'Reply all')}</label>
      {['to', 'cc', 'bcc'].map((field) => <label key={field}>{field === 'to' ? w('An', 'To') : field.toUpperCase()}<input type="text" disabled={locked} autoComplete="off" value={draft[field]} onChange={(event) => update(field, event.target.value)} placeholder="name@example.com" /></label>)}
      <label>{w('Deine Antwort', 'Your reply')}<textarea disabled={locked} value={draft.body} onChange={(event) => update('body', event.target.value)} rows={14} /></label>
      <p className="mailbox-hint">{w('Der Entwurf wird mit „Entwurf speichern“ in Drehpunkt gespeichert. Er erscheint nicht als Outlook-Entwurf.', 'Use Save draft to store your draft in Drehpunkt. It does not appear in Outlook drafts.')}</p>
      <div className="mailbox-reply-buttons"><button type="button" disabled={locked || !dirty} onClick={save}>{w('Entwurf speichern', 'Save draft')}</button><button type="button" disabled={locked} onClick={send}>{busy ? w('Bitte warten …', 'Please wait …') : w('Antwort senden', 'Send reply')}</button></div>
      {dirty && !locked && <p role="status">{w('Ungespeicherte Änderungen', 'Unsaved changes')}</p>}
      {notice && <p role="status">{notice}</p>}
      {['unknown', 'sending'].includes(sendState) && !notice && <p role="alert">{w('Der Versand wurde bereits gestartet. Bitte den Status in Outlook prüfen; erneutes Senden ist hier gesperrt.', 'Sending has already started. Check Outlook; sending again is blocked here.')}</p>}
      {sendState === 'accepted' && !notice && <p role="status">{w('Diese Antwort wurde zum Versand angenommen.', 'This reply was accepted for sending.')}</p>}
    </>}
  </aside>
}
