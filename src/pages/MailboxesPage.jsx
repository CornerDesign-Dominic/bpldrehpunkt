import MailActionButton from '../components/mailboxes/MailActionButton.jsx'
import MailInvoiceAction from '../components/mailboxes/MailInvoiceAction.jsx'
import MailAgbAction from '../components/mailboxes/MailAgbAction.jsx'
import MailActionIndicators from '../components/mailboxes/MailActionIndicators.jsx'
import { useMailboxActionList } from '../mailboxes/useMailboxAction.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiSearch } from 'react-icons/fi'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.js'
import { useLanguage } from '../i18n/useLanguage.js'
import { canEdit, canView } from '../lib/permissions.js'
import MailTrackingAction from '../components/mailboxes/MailTrackingAction.jsx'
import MailOrderAction from '../components/mailboxes/MailOrderAction.jsx'
import { mailboxCall } from '../lib/mailboxes.js'
import { parseRecipients, recipientAddress, recipientText, replyRecipients, safeOutlookLink } from '../lib/mailboxHelpers.js'
import { groupMailboxAttachments } from '../lib/mailboxAttachmentPresentation.js'
import { splitMailConversation } from '../lib/mailboxConversation.js'
import MailboxAttachmentList from '../components/mailboxes/MailboxAttachmentList.jsx'
import Toast from '../components/ui/Toast.jsx'
import { useMailboxConnections } from '../mailboxes/useMailboxConnections.js'
import { unsavedDrafts, syncDraftCacheGuard } from '../lib/mailboxDraftCache.js'
import '../styles/mailboxes.css'

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
  const { connections, loading, error, refresh } = useMailboxConnections()
  const [params, setParams] = useSearchParams()
  const dirtyRef = useRef(false)
  const orderDirtyRef = useRef(false)
  const connectionId = params.get('mailbox') || ''
  const messageId = params.get('message') || ''
  const connection = connections.find(item => item.id === connectionId)
  const pending = params.get('connection') === 'pending'
  const storageKey = 'drehpunkt.mailboxes.last.' + user?.uid

  useEffect(() => {
    const available = connections.filter(item => item.status === 'connected')
    if (!available.length || pending) return
    if (connectionId) {
      if (connection?.status === 'connected') {
        try { localStorage.setItem(storageKey, JSON.stringify({ mailbox: connectionId, message: messageId })) } catch { /* Optional navigation preference. */ }
      }
      return
    }
    let last = null
    try { last = JSON.parse(localStorage.getItem(storageKey)) } catch { /* Invalid or unavailable preference. */ }
    const selected = available.find(item => item.id === last?.mailbox) || available[0]
    setParams({ mailbox: selected.id, ...(selected.id === last?.mailbox && last?.message ? { message: last.message } : {}) }, { replace: true })
  }, [connections, connectionId, messageId, connection, storageKey, setParams, pending])

  function navigate(next) {
    if ((dirtyRef.current || orderDirtyRef.current) && !window.confirm(w('Es gibt ungespeicherte Eingaben. Trotzdem wechseln?', 'There are unsaved changes. Leave anyway?'))) return
    dirtyRef.current = false
    orderDirtyRef.current = false
    setParams(next)
  }

  return <section className="mailboxes-page">
    {pending && <p role="status">{w('Postfachverbindung wird bestätigt …', 'Confirming mailbox connection …')}</p>}
    {error && <Failure message={w('Postfächer konnten nicht geladen werden.', 'Could not load mailboxes.')} retry={() => { void refresh() }} />}
    {loading && !connections.length && <p role="status">{w('Postfächer werden geladen …', 'Loading mailboxes …')}</p>}
    {!loading && !error && !connections.length && <div className="mailbox-empty"><h2>{w('Noch kein Postfach verbunden', 'No mailbox connected')}</h2><p>{w('Deine Postfächer verbindest und benennst du in den Benutzereinstellungen.', 'Connect and name your mailboxes in user settings.')}</p><Link to="/profil#postfaecher">{w('Zu meinen Postfächern in den Einstellungen', 'Open my mailbox settings')}</Link></div>}
    {connection?.status === 'disconnecting' && <div className="mailbox-empty"><p>{w('Die Postfachverbindung wird getrennt. Eine unvollständige Trennung kannst du in den Benutzereinstellungen fortsetzen.', 'This mailbox is being disconnected. Complete an unfinished disconnection in user settings.')}</p><Link to="/profil#postfaecher">{w('Postfacheinstellungen öffnen', 'Open mailbox settings')}</Link></div>}
    {connection?.status === 'connected' && <div className="mailbox-layout">
      <Inbox key={connection.id} connectionId={connection.id} selectedId={messageId} onSelect={id => navigate({ mailbox: connection.id, message: id })} />
      {messageId ? <MailWorkspace key={user?.uid + ':' + connection.id + ':' + messageId} connection={connection} messageId={messageId} editable={editable} dirtyRef={dirtyRef} orderDirtyRef={orderDirtyRef} /> : <div className="mailbox-empty">{w('Wähle eine Nachricht aus dem Posteingang.', 'Select a message from the inbox.')}</div>}
    </div>}
    {!loading && Boolean(connections.length) && connectionId && !connection && <div className="mailbox-empty"><p>{w('Dieses Postfach ist nicht verfügbar. Wähle links ein verbundenes Postfach aus.', 'This mailbox is unavailable. Select a connected mailbox in the sidebar.')}</p><Link to="/profil#postfaecher">{w('Postfacheinstellungen öffnen', 'Open mailbox settings')}</Link></div>}
  </section>
}

function Inbox({ connectionId, selectedId, onSelect }) {
  const { language } = useLanguage()
  const w = useWords()
  const [messages, setMessages] = useState([])
  const [next, setNext] = useState(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const request = useRef(0)
  const retryPage = useRef(null)
  const actionStates = useMailboxActionList(connectionId, messages.map(message => message.id))
  const load = useCallback(async (pageToken) => {
    const version = ++request.current
    retryPage.current = pageToken || null
    setBusy(true); setError('')
    try {
      const result = await mailboxCall('listMailboxMessages', { connectionId, ...(search ? { search } : {}), ...(pageToken ? { pageToken } : {}) })
      if (version !== request.current) return
      setMessages((current) => pageToken ? [...new Map([...current, ...result.messages].map((item) => [item.id, item])).values()] : result.messages)
      setNext(result.nextPageToken || null)
    } catch { if (version === request.current) setError(w('Nachrichten konnten nicht geladen werden.', 'Could not load messages.')) }
    finally { if (version === request.current) setBusy(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, search])
  useEffect(() => {
    const task = setTimeout(() => { setMessages([]); setNext(null); void load() }, 0)
    // Invalidate outstanding requests after this inbox unmounts.
    const currentRequest = request
    return () => { clearTimeout(task); ++currentRequest.current }
  }, [load])
  return <aside className="mailbox-inbox" aria-label={w('Posteingang', 'Inbox')}><div className="mailbox-panel-heading"><h2>{w('Posteingang', 'Inbox')}</h2><button type="button" disabled={busy} onClick={() => load()}>{w('Aktualisieren', 'Refresh')}</button></div>
    <form className="mailbox-search" role="search" onSubmit={event => { event.preventDefault(); const nextSearch = searchInput.trim(); if (nextSearch === search) void load(); else setSearch(nextSearch) }}>
      <div className="mailbox-search-row"><input aria-label={w('Posteingang durchsuchen', 'Search inbox')} id="mailbox-search" type="search" maxLength={200} value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder={w('Absender, Betreff, Mailtext', 'Sender, subject, message text')} /><button className="mailbox-search-submit" type="submit" aria-label={w('Suchen', 'Search')} title={w('Suchen', 'Search')}><FiSearch size={17} aria-hidden="true" /></button></div>
      {search && <div><button type="button" onClick={() => { setSearchInput(''); setSearch('') }}>{w('Zurücksetzen', 'Clear search')}</button></div>}
      {search && <small role="status">{w('Suchergebnisse · bis zu 1.000 Treffer', 'Search results · up to 1,000 matches')}</small>}
    </form>
    {error && <Failure message={error} retry={() => load(retryPage.current)} />}
    <div className="mailbox-message-list">{messages.map((message) => <button className={`mailbox-message-item ${selectedId === message.id ? 'is-selected' : ''} ${message.isRead === false ? 'is-unread' : ''}`} type="button" key={message.id} onClick={() => onSelect(message.id)} aria-current={selectedId === message.id ? 'true' : undefined}>
      <span className="mailbox-message-heading"><span>{message.from?.emailAddress?.name || recipientAddress(message.from)}</span><MailActionIndicators identity={{ connectionId, messageId: message.id }} actions={actionStates} /></span><strong>{message.subject || w('(Kein Betreff)', '(No subject)')}</strong><small>{mailDate(message.receivedDateTime, language)} {message.hasAttachments ? ' · 📎' : ''}</small><span className="mailbox-preview">{message.bodyPreview}</span>
    </button>)}</div>
    {busy && <p role="status">{w('Nachrichten werden geladen …', 'Loading messages …')}</p>}
    {!busy && !error && !messages.length && <p role="status">{search ? w('Keine passenden Nachrichten gefunden.', 'No matching messages found.') : w('Der Posteingang ist leer.', 'The inbox is empty.')}</p>}
    {next && <button type="button" disabled={busy} onClick={() => load(next)}>{w('Weitere Nachrichten', 'More messages')}</button>}
  </aside>
}

function MessageContent({ message, beforeBody }) {
  const { language } = useLanguage()
  const w = useWords()
  return <><h3>{message.subject || w('(Kein Betreff)', '(No subject)')}</h3><dl className="mailbox-metadata"><dt>{w('Von', 'From')}</dt><dd>{message.from?.emailAddress?.name} &lt;{recipientAddress(message.from)}&gt;</dd><dt>{w('An', 'To')}</dt><dd>{recipientText(message.toRecipients)}</dd>{message.ccRecipients?.length > 0 && <><dt>CC</dt><dd>{recipientText(message.ccRecipients)}</dd></>}<dt>{w('Datum', 'Date')}</dt><dd>{mailDate(message.receivedDateTime, language)}</dd></dl>
    {beforeBody}<div className="mailbox-body">{message.body?.contentType?.toLowerCase() === 'html' ? w('Diese Nachricht konnte nicht sicher als Text dargestellt werden.', 'This message could not be safely displayed as text.') : splitMailConversation(message.body?.content || message.bodyPreview || w('(Leere Nachricht)', '(Empty message)')).map((part, index) => <div className="mailbox-conversation-part" key={index}>{index > 0 && <hr aria-label={w('Zitierte Nachricht', 'Quoted message')} />}{part}</div>)}</div></>
}

function MailWorkspace({ connection, messageId, editable, dirtyRef, orderDirtyRef }) {
  const { profile } = useAuth()
  const w = useWords()
  const [message, setMessage] = useState(null)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const identity = { connectionId: connection.id, messageId }
  useEffect(() => {
    let active = true
    mailboxCall('getMailboxMessage', { connectionId: connection.id, messageId }).then(({ message: item }) => { if (active) { setMessage(item); setError('') } }).catch(() => { if (active) setError(w('Diese Nachricht konnte nicht geladen werden. Sie wurde möglicherweise verschoben oder gelöscht.', 'Could not load this message. It may have been moved or deleted.')) })
    return () => { active = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.id, messageId, reload])

  if (error) return <Failure message={error} retry={() => setReload((value) => value + 1)} />
  if (!message) return <p role="status">{w('Nachricht wird geladen …', 'Loading message …')}</p>
  const { files, inlineImages } = groupMailboxAttachments(message.attachments)
  return <div className="mailbox-workspace">
    <article className="mailbox-reader" tabIndex={0} aria-label={w('Schriftverkehr', 'Correspondence')}><div className="mailbox-panel-heading"><h2>{w('Nachricht', 'Message')}</h2></div>
      <MessageContent message={message} beforeBody={<MailboxAttachmentList attachments={files} identity={identity} truncated={message.attachmentsTruncated} outlookUrl={safeOutlookLink(message.webLink)} />} />
      <MailboxAttachmentList attachments={inlineImages} identity={identity} inline outlookUrl={safeOutlookLink(message.webLink)} />
      {safeOutlookLink(message.webLink) && <a href={safeOutlookLink(message.webLink)} target="_blank" rel="noopener noreferrer">{w('Original in Outlook öffnen', 'Open original in Outlook')}</a>}
    </article>
    {editable && <aside className="mailbox-actions" aria-label={w('Aktionen', 'Actions')}><h2>{w('Aktionen', 'Actions')}</h2><ReplyComposer identity={identity} message={message} ownEmail={connection.email} dirtyRef={dirtyRef} /><hr className="mailbox-actions-divider" />{canEdit(profile, 'transportOrders') && <MailTrackingAction identity={identity} mailContent={<MessageContent message={message} />} />}{canEdit(profile, 'transportOrders') && canView(profile, 'masterData') && <MailOrderAction identity={identity} mailContent={<MessageContent message={message} />} attachments={message.attachments || []} dirtyRef={orderDirtyRef} />}{canEdit(profile, 'transportOrders') && <MailInvoiceAction identity={identity} mailContent={<MessageContent message={message} />} attachments={message.attachments || []} />}{canView(profile, 'agbChecker') && <MailAgbAction identity={identity} mailContent={<MessageContent message={message} />} attachments={message.attachments || []} />}</aside>}
  </div>
}

function ReplyComposer({ identity, message, ownEmail, dirtyRef }) {
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
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [suggestionBusy, setSuggestionBusy] = useState(false)
  const [suggestionError, setSuggestionError] = useState('')
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [undoBody, setUndoBody] = useState(null)
  const latestDraft = useRef(null)
  const suggestionRequest = useRef(false)
  const dialogRef = useRef(null)
  const dismissToast = useCallback(() => setToast(''), [])
  const active = useRef(true)
  const operation = useRef(null)
  const revision = useRef(0)
  const dirty = Boolean(draft && JSON.stringify(draft) !== saved)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    return () => { dialog.close(); document.body.style.overflow = previousOverflow }
  }, [open])

  useEffect(() => {
    let mounted = true
    active.current = true
    mailboxCall('getMailboxDraft', identity).then(({ draft: stored }) => {
      if (!mounted) return
      const initial = stored ? { to: recipientText(stored.toRecipients), cc: recipientText(stored.ccRecipients), bcc: recipientText(stored.bccRecipients), body: stored.sendStatus === 'accepted' ? '' : stored.body || '', replyAll: stored.replyAll === true, suggestion: stored.sendStatus === 'accepted' ? '' : stored.suggestion || '', suggestionInstruction: stored.sendStatus === 'accepted' ? '' : stored.suggestionInstruction || '' } : { ...replyRecipients(message, ownEmail), body: '', replyAll: false, suggestion: '', suggestionInstruction: '' }
      const cached = stored?.sendStatus === 'accepted' ? null : unsavedDrafts.get(cacheKey)
      latestDraft.current = cached?.draft || initial
      setSuggestionsOpen(Boolean(latestDraft.current.suggestion || latestDraft.current.suggestionInstruction))
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
    return { body: draft.body, replyAll: draft.replyAll, toRecipients: parseRecipients(draft.to), ccRecipients: parseRecipients(draft.cc), bccRecipients: parseRecipients(draft.bcc), revision: revision.current, suggestion: draft.suggestion || '', suggestionInstruction: draft.suggestionInstruction || '' }
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
      dirtyRef.current = false
      if (result.status === 'accepted') {
        const cleared = { ...draft, body: '', suggestion: '', suggestionInstruction: '' }
        latestDraft.current = cleared
        setUndoBody(null); setSuggestionsOpen(false); setSuggestionError('')
        setDraft(cleared); setSaved(JSON.stringify(cleared)); setOpen(false)
        setToast(w('Antwort gesendet.', 'Reply sent.'))
      } else {
        setSaved(JSON.stringify(draft))
        setNotice(w('Versandstatus unklar. Bitte zuerst in Outlook unter „Gesendete Elemente“ prüfen und nicht erneut senden.', 'Sending status is unclear. Check Sent Items in Outlook before sending anything again.'))
      }
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
    latestDraft.current = next
    if (JSON.stringify(next) !== saved) unsavedDrafts.set(cacheKey, { draft: next, saved, revision: revision.current })
    else unsavedDrafts.delete(cacheKey)
    syncDraftCacheGuard()
    dirtyRef.current = JSON.stringify(next) !== saved
    setDraft(next)
  }
  async function suggest() {
    if (suggestionRequest.current || busy || sendState) return
    suggestionRequest.current = true
    setSuggestionsOpen(true); setSuggestionBusy(true); setSuggestionError('')
    const current = latestDraft.current
    try {
      const result = await mailboxCall('suggestMailboxReply', { ...identity, instruction: current.suggestionInstruction || '', currentReply: current.body, previousSuggestion: current.suggestion || '' })
      if (active.current) changeDraft({ ...latestDraft.current, suggestion: result.suggestion })
    } catch (error) {
      if (active.current) setSuggestionError(error?.code === 'functions/resource-exhausted' ? w('Bis zu 20 Vorschläge pro Stunde. Bitte später erneut versuchen.', 'Up to 20 suggestions per hour. Please try again later.') : error?.code === 'functions/already-exists' ? w('Für diese Mail wird bereits ein Vorschlag erstellt. Bitte kurz warten und erneut versuchen.', 'A suggestion is already being generated for this message. Please wait and try again.') : w('Vorschlag konnte nicht erstellt werden. Dein Text und der bisherige Vorschlag bleiben erhalten.', 'Could not generate a suggestion. Your text and previous suggestion are preserved.'))
    } finally {
      suggestionRequest.current = false
      if (active.current) setSuggestionBusy(false)
    }
  }
  function update(field, value) { changeDraft({ ...draft, [field]: value }); setNotice('') }
  const locked = busy || ['accepted', 'unknown', 'sending'].includes(sendState)
  return <><MailActionButton kind="reply" onClick={() => setOpen(true)} expanded={open} disabled={sendState === 'accepted'} hint={sendState !== 'accepted' && draft?.body ? w('Entwurf vorhanden', 'Draft available') : undefined}>{sendState === 'accepted' ? w('Antwort gesendet', 'Reply sent') : w('Antworten', 'Reply')}</MailActionButton>
    <dialog ref={dialogRef} className="mailbox-reply-dialog" aria-labelledby="mailbox-reply-title" onCancel={event => { event.preventDefault(); if (!busy) setOpen(false) }}>
      <div className="mailbox-panel-heading mailbox-reply-dialog__heading"><h2 id="mailbox-reply-title">{w('Antworten', 'Reply')}</h2><button type="button" disabled={busy} onClick={() => setOpen(false)}>{w('Schließen', 'Close')}</button></div>
      <div className="mailbox-reply-dialog__columns"><article className="mailbox-reader" aria-label={w('Schriftverkehr', 'Correspondence')}><MessageContent message={message} /></article>
      <aside className="mailbox-reply" aria-label={w('Antwort verfassen', 'Compose reply')}>
    {error && <Failure message={error} retry={!draft ? () => setReload((value) => value + 1) : undefined} />}
    {!draft && !error && <p role="status">{w('Entwurf wird geladen …', 'Loading draft …')}</p>}
    {draft && <><label className="mailbox-reply-mode"><input type="checkbox" checked={draft.replyAll} disabled={locked} onChange={(event) => {
      const replyAll = event.target.checked
      if ((draft.to !== replyRecipients(message, ownEmail, draft.replyAll).to || draft.cc !== replyRecipients(message, ownEmail, draft.replyAll).cc) && !window.confirm(w('Empfänger durch die Auswahl für diesen Antwortmodus ersetzen?', 'Replace recipients with those for this reply mode?'))) return
      changeDraft({ ...draft, ...replyRecipients(message, ownEmail, replyAll), bcc: draft.bcc, replyAll })
    }} />{w('Allen antworten', 'Reply all')}</label>
      {['to', 'cc', 'bcc'].map((field) => <label className="mailbox-recipient-field" key={field}><span>{field === 'to' ? w('An', 'To') : field.toUpperCase()}</span><input type="text" disabled={locked} autoComplete="off" value={draft[field]} onChange={(event) => update(field, event.target.value)} placeholder="name@example.com" /></label>)}
      <label>{w('Deine Antwort', 'Your reply')}<textarea disabled={locked} value={draft.body} onChange={(event) => update('body', event.target.value)} rows={14} /></label>
      <p className="mailbox-hint">{w('Der Entwurf wird mit „Entwurf speichern“ in Drehpunkt gespeichert. Er erscheint nicht als Outlook-Entwurf.', 'Use Save draft to store your draft in Drehpunkt. It does not appear in Outlook drafts.')}</p>
      <div className="mailbox-reply-buttons"><button type="button" disabled={locked || !dirty} onClick={save}>{w('Entwurf speichern', 'Save draft')}</button><button type="button" disabled={locked || suggestionBusy} onClick={send}>{busy ? w('Bitte warten …', 'Please wait …') : w('Antwort senden', 'Send reply')}</button></div>
      <section className="mailbox-suggestions" aria-label={w('Antwortvorschläge', 'Reply suggestions')} aria-busy={suggestionBusy}>
        <button type="button" disabled={locked || suggestionBusy} onClick={suggest}>{w('Vorschläge', 'Suggestions')}</button>
        {suggestionsOpen && <>
          {suggestionBusy && <p className="mailbox-suggestions__loading" role="status"><span className="mailbox-action-spinner" aria-hidden="true" />{w('Antwortvorschlag wird formuliert …', 'Writing a reply suggestion …')}</p>}
          {suggestionError && <Failure message={suggestionError} retry={!locked && !suggestionBusy ? suggest : undefined} />}
          {draft.suggestion && <div className="mailbox-suggestions__proposal"><h3>{w('Antwortvorschlag', 'Suggested reply')}</h3><p>{draft.suggestion}</p><div className="mailbox-reply-buttons"><button type="button" disabled={locked || suggestionBusy} onClick={() => { setUndoBody(draft.body); update('body', draft.suggestion) }}>{w('Übernehmen', 'Use suggestion')}</button>{undoBody !== null && <button type="button" disabled={locked} onClick={() => { update('body', undoBody); setUndoBody(null) }}>{w('Rückgängig', 'Undo')}</button>}</div></div>}
          <label>{w('Anweisung zum Neuformulieren', 'Instructions for rewriting')}<textarea className="mailbox-suggestions__instruction" rows={2} maxLength={1000} disabled={locked || suggestionBusy} value={draft.suggestionInstruction || ''} onChange={event => update('suggestionInstruction', event.target.value)} placeholder={w('Zum Beispiel: kürzer und etwas lockerer schreiben', 'For example: make it shorter and more casual')} /></label>
          <button type="button" disabled={locked || suggestionBusy} onClick={suggest}>{w('Neu formulieren', 'Rewrite')}</button>
          <small className="mailbox-hint">{w('Bis zu 300 Wörter · ohne Anhänge. Vorschlag und Anweisung werden mit „Entwurf speichern“ gespeichert.', 'Up to 300 words · no attachments. Save draft also saves the suggestion and instructions.')}</small>
        </>}
      </section>
      {dirty && !locked && <p role="status">{w('Ungespeicherte Änderungen', 'Unsaved changes')}</p>}
      {notice && <p role="status">{notice}</p>}
      {['unknown', 'sending'].includes(sendState) && !notice && <p role="alert">{w('Der Versand wurde bereits gestartet. Bitte den Status in Outlook prüfen; erneutes Senden ist hier gesperrt.', 'Sending has already started. Check Outlook; sending again is blocked here.')}</p>}
      {sendState === 'accepted' && !notice && <p role="status">{w('Diese Antwort wurde zum Versand angenommen.', 'This reply was accepted for sending.')}</p>}
    </>}
      </aside></div>
    </dialog>
    {toast && createPortal(<Toast message={toast} onDismiss={dismissToast} />, document.body)}
  </>
}
