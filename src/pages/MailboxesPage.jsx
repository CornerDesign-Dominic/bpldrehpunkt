import MailboxTriageProvider from '../components/mailboxes/MailboxTriageProvider.jsx'
import { useMailboxRecommendations } from '../mailboxes/useMailboxRecommendations.js'
import MailboxKnowledgeNote from '../components/mailboxes/MailboxKnowledgeNote.jsx'
import MailActionButton from '../components/mailboxes/MailActionButton.jsx'
import MailComposeAction from '../components/mailboxes/MailComposeAction.jsx'
import MailRecordAction from '../components/mailboxes/MailRecordAction.jsx'
import { mailboxRecordKinds } from '../../shared/mailboxRecordFields.js'
import MailInvoiceAction from '../components/mailboxes/MailInvoiceAction.jsx'
import MailAgbAction from '../components/mailboxes/MailAgbAction.jsx'
import MailActionIndicators from '../components/mailboxes/MailActionIndicators.jsx'
import { useMailboxActionList } from '../mailboxes/useMailboxAction.js'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiSearch, FiFlag, FiCheck, FiMail, FiBookOpen } from 'react-icons/fi'
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
import { createMailboxViewCache, mailboxFolder, mailboxFolderParams, nextMailboxFlag, patchMailboxMessage } from '../lib/mailboxViewState.js'
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
  const composeDirtyRef = useRef(false)
  const connectionId = params.get('mailbox') || ''
  const messageId = params.get('message') || ''
  const replyId = params.get('reply') || ''
  const folder = mailboxFolder(params.get('folder'))
  const [folderViews] = useState(createMailboxViewCache)
  const connection = connections.find(item => item.id === connectionId)
  const pending = params.get('connection') === 'pending'
  const storageKey = 'drehpunkt.mailboxes.last.' + user?.uid

  useEffect(() => {
    folderViews.clear()
    clearMessageMetadata()
    const update = event => folderViews.patchMessage(event.detail.connectionId, event.detail.messageId, event.detail.patch)
    window.addEventListener('drehpunkt:mail-message-state', update)
    return () => { window.removeEventListener('drehpunkt:mail-message-state', update); folderViews.clear(); clearMessageMetadata() }
  }, [user?.uid, folderViews])

  useEffect(() => {
    const available = connections.filter(item => item.status === 'connected')
    if (!available.length || pending) return
    if (connectionId) {
      if (connection?.status === 'connected') {
        const cached = folderViews.read(`${connectionId}:${folder}`)
        if (!messageId && cached?.message) { setParams(mailboxFolderParams(connectionId, folder, cached), { replace: true }); return }
        if (messageId) folderViews.write(`${connectionId}:${folder}`, { message: messageId, reply: replyId })
        try { localStorage.setItem(storageKey, JSON.stringify({ mailbox: connectionId, message: messageId, reply: replyId, folder })) } catch { /* Optional navigation preference. */ }
      }
      return
    }
    let last = null
    try { last = JSON.parse(localStorage.getItem(storageKey)) } catch { /* Invalid or unavailable preference. */ }
    const selected = available.find(item => item.id === last?.mailbox) || available[0]
    setParams({ mailbox: selected.id, folder: selected.id === last?.mailbox ? mailboxFolder(last?.folder) : 'inbox', ...(selected.id === last?.mailbox && last?.message ? { message: last.message, ...(last.reply ? { reply: last.reply } : {}) } : {}) }, { replace: true })
  }, [connections, connectionId, messageId, replyId, folder, connection, storageKey, setParams, pending, folderViews])

  function navigate(next) {
    if ((dirtyRef.current || orderDirtyRef.current || composeDirtyRef.current) && !window.confirm(w('Es gibt ungespeicherte Eingaben. Trotzdem wechseln?', 'There are unsaved changes. Leave anyway?'))) return
    dirtyRef.current = false
    orderDirtyRef.current = false
    composeDirtyRef.current = false
    folderViews.write(`${connectionId}:${folder}`, { ...(folderViews.read(`${connectionId}:${folder}`) || {}), message: messageId, reply: replyId })
    setParams(next)
  }

  return <section className="mailboxes-page">
    {pending && <p role="status">{w('Postfachverbindung wird bestätigt …', 'Confirming mailbox connection …')}</p>}
    {error && <Failure message={w('Postfächer konnten nicht geladen werden.', 'Could not load mailboxes.')} retry={() => { void refresh() }} />}
    {loading && !connections.length && <p role="status">{w('Postfächer werden geladen …', 'Loading mailboxes …')}</p>}
    {!loading && !error && !connections.length && <div className="mailbox-empty"><h2>{w('Noch kein Postfach verbunden', 'No mailbox connected')}</h2><p>{w('Deine Postfächer verbindest und benennst du in den Benutzereinstellungen.', 'Connect and name your mailboxes in user settings.')}</p><Link to="/profil#postfaecher">{w('Zu meinen Postfächern in den Einstellungen', 'Open my mailbox settings')}</Link></div>}
    {connection?.status === 'disconnecting' && <div className="mailbox-empty"><p>{w('Die Postfachverbindung wird getrennt. Eine unvollständige Trennung kannst du in den Benutzereinstellungen fortsetzen.', 'This mailbox is being disconnected. Complete an unfinished disconnection in user settings.')}</p><Link to="/profil#postfaecher">{w('Postfacheinstellungen öffnen', 'Open mailbox settings')}</Link></div>}
    {connection?.status === 'connected' && <div className="mailbox-layout">
      <Inbox key={connection.id + ':' + folder} connectionId={connection.id} folder={folder} editable={editable} cache={folderViews} selectedId={replyId || messageId} onFolder={nextFolder => navigate(mailboxFolderParams(connection.id, nextFolder, folderViews.read(`${connection.id}:${nextFolder}`)))} onSelect={id => navigate({ mailbox: connection.id, folder, message: id })} onSelectReply={(sourceId, id) => navigate({ mailbox: connection.id, folder, message: sourceId, reply: id })} />
      {messageId ? <MailWorkspace key={user?.uid + ':' + connection.id + ':' + folder + ':' + messageId + ':' + replyId} connection={connection} messageId={replyId || messageId} sent={folder === 'sentitems' || Boolean(replyId)} onShowIncoming={replyId ? () => navigate({ mailbox: connection.id, folder, message: messageId }) : undefined} editable={editable && folder === 'inbox' && !replyId} canCompose={editable} composeDirtyRef={composeDirtyRef} dirtyRef={dirtyRef} orderDirtyRef={orderDirtyRef} /> : <div className="mailbox-workspace"><div className="mailbox-empty">{w('Wähle eine Nachricht aus der Liste.', 'Select a message from the list.')}</div>{editable && <aside className="mailbox-actions" aria-label={w('Aktionen', 'Actions')}><h2>{w('Aktionen', 'Actions')}</h2><MailComposeAction connection={connection} dirtyRef={composeDirtyRef} /></aside>}</div>}

    </div>}
    {!loading && Boolean(connections.length) && connectionId && !connection && <div className="mailbox-empty"><p>{w('Dieses Postfach ist nicht verfügbar. Wähle links ein verbundenes Postfach aus.', 'This mailbox is unavailable. Select a connected mailbox in the sidebar.')}</p><Link to="/profil#postfaecher">{w('Postfacheinstellungen öffnen', 'Open mailbox settings')}</Link></div>}
  </section>
}

function Inbox({ connectionId, folder, editable, cache, selectedId, onSelect, onSelectReply, onFolder }) {
  const { language } = useLanguage()
  const w = useWords()
  const cacheKey = `${connectionId}:${folder}`
  const [initial] = useState(() => cache.read(cacheKey) || null)
  const started = useRef(false)
  const listRef = useRef(null)
  const scrollTop = useRef(initial?.scrollTop || 0)
  const [messages, setMessages] = useState(initial?.messages || [])
  const [next, setNext] = useState(initial?.next || null)
  const [busy, setBusy] = useState(!initial?.loaded)
  const [loaded, setLoaded] = useState(initial?.loaded || false)
  const [error, setError] = useState('')
  const [searchInput, setSearchInput] = useState(initial?.searchInput || '')
  const [search, setSearch] = useState(initial?.search || '')
  const request = useRef(0)
  const retryPage = useRef(null)
  const [replies, setReplies] = useState({})
  const [replyError, setReplyError] = useState(false)
  const [replyPartial, setReplyPartial] = useState(false)
  const [replyReload, setReplyReload] = useState(0)
  const [recommendationReload, setRecommendationReload] = useState(0)
  const replyIds = folder === 'inbox' ? messages.map(message => message.id).join('\n') : ''
  useLayoutEffect(() => { if (listRef.current) listRef.current.scrollTop = scrollTop.current }, [])
  useEffect(() => { cache.write(cacheKey, { ...cache.read(cacheKey), messages, next, searchInput, search, loaded, scrollTop: scrollTop.current }) }, [cache, cacheKey, messages, next, searchInput, search, loaded])
  useEffect(() => { const update = event => { if (event.detail.connectionId === connectionId) setMessages(current => patchMailboxMessage(current, event.detail.messageId, event.detail.patch)) }; window.addEventListener('drehpunkt:mail-message-state', update); return () => window.removeEventListener('drehpunkt:mail-message-state', update) }, [connectionId])
  const { recommendations, revision: recommendationRevision } = useMailboxRecommendations(folder === 'inbox' ? connectionId : '', folder === 'inbox' ? messages.map(message => message.id) : [], recommendationReload)
  const actionStates = useMailboxActionList(folder === 'inbox' ? connectionId : '', folder === 'inbox' ? messages.map(message => message.id) : [])
  const load = useCallback(async (pageToken) => {
    const version = ++request.current
    const stateEpoch = messageMutationEpoch
    retryPage.current = pageToken || null
    setBusy(true); setError('')
    if (!pageToken) setLoaded(false)
    try {
      const result = await mailboxCall('listMailboxMessages', { connectionId, folder, ...(search ? { search } : {}), ...(pageToken ? { pageToken } : {}) })
      if (version !== request.current) return
      setMessages(current => {
        const loaded = result.messages.map(item => {
          const key = `${connectionId}:${item.id}`
          const previous = current.find(value => value.id === item.id)
          return previous && (pendingMessageMutations.has(key) || (messageMutationVersions.get(key) || 0) > stateEpoch) ? { ...item, isRead: previous.isRead, flag: previous.flag } : item
        })
        return pageToken ? [...new Map([...current, ...loaded].map(item => [item.id, item])).values()] : loaded
      })
      for (const item of result.messages) {
        const key = `${connectionId}:${item.id}`
        if (!pendingMessageMutations.has(key) && (messageMutationVersions.get(key) || 0) <= stateEpoch) window.dispatchEvent(new CustomEvent('drehpunkt:mail-message-state', { detail: { connectionId, messageId: item.id, patch: { isRead: item.isRead, flag: item.flag } } }))
      }
      setLoaded(true)
      setNext(result.nextPageToken || null)
      setReplyReload(value => value + 1)
      setRecommendationReload(value => value + 1)
    } catch { if (version === request.current) setError(w('Nachrichten konnten nicht geladen werden.', 'Could not load messages.')) }
    finally { if (version === request.current) setBusy(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, folder, search])
  const lastRecommendationRevision = useRef(null)
  useEffect(() => {
    if (!recommendationRevision || lastRecommendationRevision.current === recommendationRevision) return
    if (initial && lastRecommendationRevision.current === null) { lastRecommendationRevision.current = recommendationRevision; return }
    lastRecommendationRevision.current = recommendationRevision
    const task = setTimeout(() => { if (!search) void load(); else setRecommendationReload(value => value + 1) }, 0)
    return () => clearTimeout(task)
  }, [recommendationRevision, search, load, initial])
  useEffect(() => {
    const restoring = !started.current && initial?.loaded && initial.search === search
    started.current = true
    const task = restoring ? null : setTimeout(() => { setMessages([]); setNext(null); scrollTop.current = 0; void load() }, 0)
    // Invalidate outstanding requests after this inbox unmounts.
    const currentRequest = request
    return () => { clearTimeout(task); ++currentRequest.current }
  }, [load, initial, search])
  useEffect(() => {
    const refresh = () => setReplyReload(value => value + 1)
    const timer = setInterval(() => { if (document.visibilityState === 'visible') refresh() }, 60000)
    window.addEventListener('focus', refresh)
    window.addEventListener('drehpunkt:mail-reply-sent', refresh)
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('drehpunkt:mail-reply-sent', refresh) }
  }, [])
  useEffect(() => {
    if (!replyIds) return
    let active = true
    const loadReplies = async () => {
      const ids = replyIds.split('\n')
      let partial = false
      try {
        for (let offset = 0; offset < ids.length; offset += 30) {
          const result = await mailboxCall('listMailboxReplies', { connectionId, messageIds: ids.slice(offset, offset + 30) })
          if (!active) return
          partial ||= result.partial === true
          setReplies(current => ({ ...current, ...result.replies }))
        }
        if (active) { setReplyError(false); setReplyPartial(partial) }
      } catch { if (active) setReplyError(true) }
    }
    void loadReplies()
    return () => { active = false }
  }, [connectionId, replyIds, replyReload])
  return <aside className="mailbox-inbox" aria-label={folder === 'inbox' ? w('Posteingang', 'Inbox') : w('Gesendet', 'Sent')}><div className="mailbox-panel-heading"><div className="mailbox-folder-tabs" role="group" aria-label={w('Mailordner', 'Mail folder')}>{[['inbox', w('Posteingang', 'Inbox')], ['sentitems', w('Gesendet', 'Sent')]].map(([value, label]) => <button key={value} type="button" aria-pressed={folder === value} className={folder === value ? 'is-active' : ''} onClick={() => { if (value !== folder) onFolder(value) }}>{label}</button>)}</div><button type="button" disabled={busy} onClick={() => load()}>{w('Aktualisieren', 'Refresh')}</button></div>
    <form className="mailbox-search" role="search" onSubmit={event => { event.preventDefault(); const nextSearch = searchInput.trim(); if (nextSearch === search) void load(); else setSearch(nextSearch) }}>
      <div className="mailbox-search-row"><input aria-label={folder === 'inbox' ? w('Posteingang durchsuchen', 'Search inbox') : w('Gesendete Mails durchsuchen', 'Search sent mail')} id="mailbox-search" type="search" maxLength={200} value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder={folder === 'inbox' ? w('Absender, Betreff, Mailtext', 'Sender, subject, message text') : w('Empfänger, Betreff, Mailtext', 'Recipient, subject, message text')} /><button className="mailbox-search-submit" type="submit" aria-label={w('Suchen', 'Search')} title={w('Suchen', 'Search')}><FiSearch size={17} aria-hidden="true" /></button></div>
      {search && <div><button type="button" onClick={() => { setSearchInput(''); setSearch('') }}>{w('Zurücksetzen', 'Clear search')}</button></div>}
      {search && <small role="status">{w('Suchergebnisse · bis zu 1.000 Treffer', 'Search results · up to 1,000 matches')}</small>}
    </form>
    {error && <Failure message={error} retry={() => load(retryPage.current)} />}
    <div className="mailbox-message-list" ref={listRef} onScroll={event => { scrollTop.current = event.currentTarget.scrollTop; cache.write(cacheKey, { ...cache.read(cacheKey), scrollTop: scrollTop.current }) }}>{messages.map((message) => <div className="mailbox-message-group" key={message.id}><div className={`mailbox-message-card ${message.isRead === false ? 'is-unread' : ''}`}><button className={`mailbox-message-item ${selectedId === message.id ? 'is-selected' : ''} ${message.isRead === false ? 'is-unread' : ''}`} type="button" onClick={() => onSelect(message.id)} aria-current={selectedId === message.id ? 'true' : undefined}>
      <span className="mailbox-message-heading"><span>{message.isRead === false && <i className="mailbox-unread-dot" role="img" aria-label={w('Ungelesen', 'Unread')} />}{folder === 'sentitems' ? recipientText(message.toRecipients) || w('(Kein Empfänger)', '(No recipient)') : message.from?.emailAddress?.name || recipientAddress(message.from)}</span>{folder === 'inbox' && <MailActionIndicators identity={{ connectionId, messageId: message.id }} actions={actionStates} recommendations={recommendations[message.id] || []} />}</span><strong>{message.subject || w('(Kein Betreff)', '(No subject)')}</strong><small>{mailDate(folder === 'sentitems' ? message.sentDateTime : message.receivedDateTime, language)} {message.hasAttachments ? ' · 📎' : ''}</small><span className="mailbox-preview">{message.bodyPreview}</span>
    </button>{editable ? <MessageStateControls connectionId={connectionId} message={message} compact /> : <PassiveMessageFlag message={message} />}</div>{(replies[message.id] || []).map(reply => <button className={`mailbox-replied-row ${selectedId === reply.id ? 'is-selected' : ''}`} type="button" key={reply.id} onClick={() => onSelectReply(message.id, reply.id)} aria-current={selectedId === reply.id ? 'true' : undefined} aria-label={`${w('Beantwortet', 'Replied')} · ${mailDate(reply.sentDateTime, language)}`}><span>{w('Beantwortet', 'Replied')}</span><time dateTime={reply.sentDateTime}>{mailDate(reply.sentDateTime, language)}</time><span aria-hidden="true">✓</span></button>)}</div>)}</div>
    {busy && <p role="status">{w('Nachrichten werden geladen …', 'Loading messages …')}</p>}
    {!busy && !error && !messages.length && <p role="status">{search ? w('Keine passenden Nachrichten gefunden.', 'No matching messages found.') : folder === 'inbox' ? w('Der Posteingang ist leer.', 'The inbox is empty.') : w('Keine gesendeten Nachrichten.', 'No sent messages.')}</p>}
    {(replyError || replyPartial) && <small className="mailbox-replies-warning" role="status">{w('Antworten konnten noch nicht vollständig geprüft werden.', 'Replies could not yet be fully checked.')} <button type="button" onClick={() => setReplyReload(value => value + 1)}>{w('Erneut prüfen', 'Check again')}</button></small>}
    {next && <button type="button" disabled={busy} onClick={() => load(next)}>{w('Weitere Nachrichten', 'More messages')}</button>}
  </aside>
}

const pendingMessageMutations = new Map()
const messageMutationVersions = new Map()
const readMutationVersions = new Map()
const confirmedMessagePatches = new Map()
let messageMutationEpoch = 0
function clearMessageMetadata() { messageMutationVersions.clear(); readMutationVersions.clear(); confirmedMessagePatches.clear() }
function retainMessageMetadata() {
  for (const map of [messageMutationVersions, readMutationVersions, confirmedMessagePatches]) {
    while (map.size > 1000) {
      const candidate = [...map.keys()].find(key => !pendingMessageMutations.has(key))
      if (!candidate) break
      map.delete(candidate)
    }
  }
}

function useMessageStateMutation(identity) {
  const w = useWords()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const mutate = useCallback(async patch => {
    const key = `${identity.connectionId}:${identity.messageId}`
    const mutationEpoch = ++messageMutationEpoch
    messageMutationVersions.set(key, mutationEpoch)
    if (Object.hasOwn(patch, 'isRead')) readMutationVersions.set(key, mutationEpoch)
    setBusy(true); setError('')
    const previous = pendingMessageMutations.get(key) || Promise.resolve()
    const task = previous.catch(() => {}).then(() => mailboxCall('updateMailboxMessageState', { ...identity, ...patch }))
    pendingMessageMutations.set(key, task)
    try {
      const result = await task
      const saved = Object.hasOwn(patch, 'isRead') ? { isRead: typeof result.message?.isRead === 'boolean' ? result.message.isRead : patch.isRead } : { flag: result.message?.flag || { flagStatus: patch.flagStatus } }
      const latest = confirmedMessagePatches.get(key)
      confirmedMessagePatches.set(key, { epoch: Math.max(latest?.epoch || 0, mutationEpoch), patch: { ...latest?.patch, ...saved } })
      window.dispatchEvent(new CustomEvent('drehpunkt:mail-message-state', { detail: { ...identity, patch: saved } }))
      return true
    } catch (failure) {
      if (alive.current) setError(failure?.details?.technicalCode === 'mailbox_write_scope_required' || failure?.code === 'functions/permission-denied' ? w('Microsoft-Verbindung bitte in deinem Profil erneuern, um den Status zu ändern.', 'Renew your Microsoft connection in your profile to change message status.') : w('Der Status konnte nicht bei Microsoft gespeichert werden. Bitte erneut versuchen.', 'Could not save the status in Microsoft. Please try again.'))
      return false
    } finally {
      if (pendingMessageMutations.get(key) === task) pendingMessageMutations.delete(key)
      retainMessageMetadata()
      if (alive.current) setBusy(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.connectionId, identity.messageId])
  return { busy, error, mutate }
}

function PassiveMessageFlag({ message }) {
  const w = useWords()
  const status = message.flag?.flagStatus
  if (!['flagged', 'complete'].includes(status)) return null
  const label = status === 'complete' ? w('Erledigt', 'Completed') : w('Zur Nachverfolgung markiert', 'Flagged for follow-up')
  return <span className={`mailbox-passive-flag mailbox-flag--${status}`} role="img" aria-label={label} title={label}>{status === 'complete' ? <FiCheck aria-hidden="true" /> : <FiFlag aria-hidden="true" />}</span>
}

function MessageStateControls({ connectionId, message, compact = false }) {
  const w = useWords()
  const { busy, error, mutate } = useMessageStateMutation({ connectionId, messageId: message.id })
  const flag = message.flag?.flagStatus || 'notFlagged'
  const nextFlag = nextMailboxFlag(flag)
  const flagLabel = flag === 'complete' ? w('Erledigt', 'Completed') : flag === 'flagged' ? w('Zur Nachverfolgung markiert', 'Flagged for follow-up') : w('Nicht markiert', 'Not flagged')
  const nextLabel = nextFlag === 'complete' ? w('Als erledigt markieren', 'Mark complete') : nextFlag === 'flagged' ? w('Zur Nachverfolgung markieren', 'Flag for follow-up') : w('Markierung entfernen', 'Clear flag')
  return <div className={`mailbox-message-state ${compact ? 'is-compact' : ''}`}>
    <div className="mailbox-message-state-buttons">
      {typeof message.isRead === 'boolean' && <button type="button" disabled={busy} onClick={() => void mutate({ isRead: !message.isRead })} title={message.isRead ? w('Als ungelesen markieren', 'Mark unread') : w('Als gelesen markieren', 'Mark read')} aria-label={message.isRead ? w('Als ungelesen markieren', 'Mark unread') : w('Als gelesen markieren', 'Mark read')}>{message.isRead ? <FiMail aria-hidden="true" /> : <FiBookOpen aria-hidden="true" />}{!compact && (message.isRead ? w('Ungelesen markieren', 'Mark unread') : w('Gelesen markieren', 'Mark read'))}</button>}
      <button type="button" disabled={busy} className={`mailbox-flag mailbox-flag--${flag}`} onClick={() => void mutate({ flagStatus: nextFlag })} title={`${flagLabel} · ${nextLabel}`} aria-label={`${flagLabel} · ${nextLabel}`}>{flag === 'complete' ? <FiCheck aria-hidden="true" /> : <FiFlag aria-hidden="true" />}{!compact && flagLabel}</button>
    </div>
    {error && <p className="mailbox-state-error" role="alert">{error} <Link to="/profil#postfaecher">{w('Postfacheinstellungen', 'Mailbox settings')}</Link></p>}
  </div>
}

function MessageContent({ message, beforeBody, sent = false }) {
  const { language } = useLanguage()
  const w = useWords()
  return <><h3>{message.subject || w('(Kein Betreff)', '(No subject)')}</h3><dl className="mailbox-metadata"><dt>{w('Von', 'From')}</dt><dd>{message.from?.emailAddress?.name} &lt;{recipientAddress(message.from)}&gt;</dd><dt>{w('An', 'To')}</dt><dd>{recipientText(message.toRecipients)}</dd>{message.ccRecipients?.length > 0 && <><dt>CC</dt><dd>{recipientText(message.ccRecipients)}</dd></>}<dt>{w('Datum', 'Date')}</dt><dd>{mailDate(sent ? message.sentDateTime : message.receivedDateTime, language)}</dd></dl>
    {beforeBody}<div className="mailbox-body">{message.body?.contentType?.toLowerCase() === 'html' ? w('Diese Nachricht konnte nicht sicher als Text dargestellt werden.', 'This message could not be safely displayed as text.') : splitMailConversation(message.body?.content || message.bodyPreview || w('(Leere Nachricht)', '(Empty message)')).map((part, index) => <div className="mailbox-conversation-part" key={index}>{index > 0 && <hr aria-label={w('Zitierte Nachricht', 'Quoted message')} />}{part}</div>)}</div></>
}

function MailWorkspace({ connection, messageId, sent = false, onShowIncoming, editable, canCompose, composeDirtyRef, dirtyRef, orderDirtyRef }) {
  const { profile } = useAuth()
  const w = useWords()
  const [message, setMessage] = useState(null)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const identity = { connectionId: connection.id, messageId }
  const { error: stateError, mutate: mutateState } = useMessageStateMutation(identity)
  const readAttempted = useRef(false)
  useEffect(() => {
    const update = event => { if (event.detail.connectionId === connection.id && event.detail.messageId === messageId) setMessage(current => current ? patchMailboxMessage([current], messageId, event.detail.patch)[0] : current) }
    window.addEventListener('drehpunkt:mail-message-state', update)
    return () => window.removeEventListener('drehpunkt:mail-message-state', update)
  }, [connection.id, messageId])
  useEffect(() => {
    if (!editable || sent || !message || error || message.body?.contentType?.toLowerCase() !== 'text' || readAttempted.current) return
    readAttempted.current = true
    if (message.isRead === false) void mutateState({ isRead: true })
  }, [editable, sent, message, error, mutateState])
  const { recommendations, decisions, decisionStates, loadError: triageLoadError } = useMailboxRecommendations(sent ? '' : connection.id, sent ? [] : [messageId], reload)
  const recommended = recommendations[messageId] || []
  useEffect(() => {
    let active = true
    const stateEpoch = messageMutationEpoch
    const stateKey = `${connection.id}:${messageId}`
    mailboxCall('getMailboxMessage', { connectionId: connection.id, messageId }).then(({ message: item }) => {
      if (active) {
        const latest = confirmedMessagePatches.get(stateKey)
        if ((readMutationVersions.get(stateKey) || 0) > stateEpoch) readAttempted.current = true
        setMessage(latest?.epoch > stateEpoch ? patchMailboxMessage([item], item.id, latest.patch)[0] : item)
        setError('')
      }
    }).catch(() => { if (active) setError(w('Diese Nachricht konnte nicht geladen werden. Sie wurde möglicherweise verschoben oder gelöscht.', 'Could not load this message. It may have been moved or deleted.')) })
    return () => { active = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.id, messageId, reload])

  const { files, inlineImages } = groupMailboxAttachments(message?.attachments || [])
  return <div className="mailbox-workspace">
    <article className="mailbox-reader" tabIndex={0} aria-label={sent ? w('Gesendete Nachricht', 'Sent message') : w('Schriftverkehr', 'Correspondence')}><div className="mailbox-panel-heading"><h2>{sent ? w('Gesendete Nachricht', 'Sent message') : w('Nachricht', 'Message')}</h2>{sent && onShowIncoming && <button type="button" onClick={onShowIncoming}>{w('Eingangsmail anzeigen', 'Show incoming message')}</button>}</div>
      {stateError && <p className="mailbox-state-error" role="alert">{stateError} <Link to="/profil#postfaecher">{w('Postfacheinstellungen', 'Mailbox settings')}</Link></p>}{error ? <Failure message={error} retry={() => setReload((value) => value + 1)} /> : !message ? <p role="status">{w('Nachricht wird geladen …', 'Loading message …')}</p> : <>{canCompose ? <MessageStateControls connectionId={connection.id} message={message} /> : <PassiveMessageFlag message={message} />}<MessageContent message={message} sent={sent} beforeBody={<MailboxAttachmentList attachments={files} identity={identity} truncated={message.attachmentsTruncated} outlookUrl={safeOutlookLink(message.webLink)} />} />
      <MailboxAttachmentList attachments={inlineImages} identity={identity} inline outlookUrl={safeOutlookLink(message.webLink)} />
      {safeOutlookLink(message.webLink) && <a href={safeOutlookLink(message.webLink)} target="_blank" rel="noopener noreferrer">{w('Original in Outlook öffnen', 'Open original in Outlook')}</a>}</>}
    </article>
    {(editable || canCompose) && <MailboxTriageProvider key={`${identity.connectionId}:${identity.messageId}`} identity={identity} decision={decisions[messageId]} decisionState={triageLoadError ? 'unavailable' : decisionStates[messageId]} recommended={recommended}><aside className="mailbox-actions" aria-label={w('Aktionen', 'Actions')}><h2>{w('Aktionen', 'Actions')}</h2>{canCompose && <MailComposeAction connection={connection} dirtyRef={composeDirtyRef} />}{editable && message && !error && <><ReplyComposer identity={identity} message={message} ownEmail={connection.email} dirtyRef={dirtyRef} /><hr className="mailbox-actions-divider" />{(canEdit(profile, 'transportOrders') || canView(profile, 'agbChecker')) && <div className="mailbox-action-row">
        {canEdit(profile, 'transportOrders') && <div className="mailbox-action-cell"><MailTrackingAction recommended={recommended.includes('tracking')} identity={identity} mailContent={<MessageContent message={message} />} /></div>}
        {canEdit(profile, 'transportOrders') && canView(profile, 'masterData') && <div className="mailbox-action-cell"><MailOrderAction recommended={recommended.includes('order')} identity={identity} mailContent={<MessageContent message={message} />} attachments={message.attachments || []} dirtyRef={orderDirtyRef} /></div>}
        {canView(profile, 'agbChecker') && <div className="mailbox-action-cell"><MailAgbAction recommended={recommended.includes('terms')} identity={identity} mailContent={<MessageContent message={message} />} attachments={message.attachments || []} /></div>}
      </div>}
      <hr className="mailbox-actions-divider" />
      {canEdit(profile, 'transportOrders') && <><MailInvoiceAction recommended={recommended.includes('invoice')} identity={identity} mailContent={<MessageContent message={message} />} attachments={message.attachments || []} /><MailActionButton kind="invoice" hint="-BETA-" disabled>{w('Mahnung prüfen', 'Review payment reminder')}</MailActionButton><hr className="mailbox-actions-divider" /></>}
      {Object.entries(mailboxRecordKinds).filter(([kind, config]) => kind === 'calendar' ? canView(profile, config.module) : canEdit(profile, config.module)).map(([kind]) => <MailRecordAction key={kind} kind={kind} recommended={recommended.includes(kind)} identity={identity} mailContent={<MessageContent message={message} />} attachments={message.attachments || []} />)}</>}</aside></MailboxTriageProvider>}
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
  const sending = useRef(false)
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
    mailboxCall('getMailboxDraft', identity).then(async ({ draft: stored }) => {
      if (!mounted) return
      const previouslySent = stored?.sendStatus === 'accepted'
      if (previouslySent) {
        // Also prepare a fresh reply when returning to a previously answered mail.
        // This completes before exposing the draft, including an already opened dialog.
        const result = await mailboxCall('saveMailboxDraft', { ...identity, draft: { ...stored, body: '', suggestion: '', suggestionInstruction: '' } })
        if (!mounted) return
        stored = result.draft
      }
      const initial = stored ? { to: recipientText(stored.toRecipients), cc: recipientText(stored.ccRecipients), bcc: recipientText(stored.bccRecipients), body: stored.sendStatus === 'accepted' ? '' : stored.body || '', replyAll: stored.replyAll === true, suggestion: stored.sendStatus === 'accepted' ? '' : stored.suggestion || '', suggestionInstruction: stored.sendStatus === 'accepted' ? '' : stored.suggestionInstruction || '', suggestionKnowledge: stored.sendStatus === 'accepted' ? null : stored.suggestionKnowledge || null } : { ...replyRecipients(message, ownEmail), body: '', replyAll: false, suggestion: '', suggestionInstruction: '', suggestionKnowledge: null }
      const cached = previouslySent ? null : unsavedDrafts.get(cacheKey)
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
    if (sending.current) return
    setError(''); setNotice('')
    let value
    try {
      value = payload()
      if (!value.toRecipients.length || !value.body.trim()) throw new Error('empty')
    } catch { setError(w('Bitte Empfänger und Antworttext prüfen. Adressen mit Semikolon trennen.', 'Check recipients and reply text. Separate addresses with semicolons.')); return }
    sending.current = true
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
        const cleared = { ...draft, body: '', suggestion: '', suggestionInstruction: '', suggestionKnowledge: null }
        latestDraft.current = cleared
        setUndoBody(null); setSuggestionsOpen(false); setSuggestionError('')
        setDraft(cleared); setSaved(JSON.stringify(cleared)); setOpen(false)
        setToast(w('Antwort gesendet.', 'Reply sent.'))
        window.dispatchEvent(new Event('drehpunkt:mail-reply-sent'))
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
    } finally { sending.current = false; if (active.current) setBusy(false) }
  }
  async function openReply() {
    setOpen(true)
    if (sendState !== 'accepted' || busy || !draft) return
    setBusy(true); setError(''); setNotice('')
    try {
      // A new draft releases only a confirmed previous send. Unknown sends stay locked.
      const result = await mailboxCall('saveMailboxDraft', { ...identity, draft: payload() })
      if (!active.current) return
      revision.current = result.draft.revision
      operation.current = null
      setSendState('')
    } catch {
      if (active.current) setError(w('Eine weitere Antwort konnte nicht vorbereitet werden. Bitte schließen und erneut versuchen oder die Seite aktualisieren.', 'Could not prepare another reply. Close and try again, or refresh the page.'))
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
      if (active.current) changeDraft({ ...latestDraft.current, suggestion: result.suggestion, suggestionKnowledge: result.knowledge || null })
    } catch (error) {
      if (active.current) setSuggestionError(error?.code === 'functions/resource-exhausted' ? w('Bis zu 20 Vorschläge pro Stunde. Bitte später erneut versuchen.', 'Up to 20 suggestions per hour. Please try again later.') : error?.code === 'functions/already-exists' ? w('Für diese Mail wird bereits ein Vorschlag erstellt. Bitte kurz warten und erneut versuchen.', 'A suggestion is already being generated for this message. Please wait and try again.') : w('Vorschlag konnte nicht erstellt werden. Dein Text und der bisherige Vorschlag bleiben erhalten.', 'Could not generate a suggestion. Your text and previous suggestion are preserved.'))
    } finally {
      suggestionRequest.current = false
      if (active.current) setSuggestionBusy(false)
    }
  }
  function update(field, value) { changeDraft({ ...draft, [field]: value }); setNotice('') }
  const locked = busy || ['accepted', 'unknown', 'sending'].includes(sendState)
  return <><MailActionButton kind="reply" onClick={openReply} expanded={open} disabled={busy} hint={sendState !== 'accepted' && draft?.body ? w('Entwurf vorhanden', 'Draft available') : undefined}>{w('Antworten', 'Reply')}</MailActionButton>
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
      <div className="mailbox-reply-buttons mailbox-reply-buttons--send"><button type="button" disabled={locked || !dirty} onClick={save}>{w('Entwurf speichern', 'Save draft')}</button><button type="button" disabled={locked || suggestionBusy} onClick={send}>{busy ? w('Bitte warten …', 'Please wait …') : w('Antwort senden', 'Send reply')}</button></div>
      <section className="mailbox-suggestions" aria-label={w('Antwortvorschläge', 'Reply suggestions')} aria-busy={suggestionBusy}>
        <button type="button" className="mailbox-suggestions__generate" disabled={locked || suggestionBusy} onClick={suggest}>{w('Vorschlag machen', 'Make a suggestion')}</button>
        <label>{w('Anweisung für den Antwortvorschlag', 'Instructions for the reply suggestion')}<textarea className="mailbox-suggestions__instruction" rows={2} maxLength={1000} disabled={locked || suggestionBusy} value={draft.suggestionInstruction || ''} onChange={event => update('suggestionInstruction', event.target.value)} placeholder={w('Zum Beispiel: Eingang bestätigen und nach dem Liefertermin fragen', 'For example: confirm receipt and ask for the delivery date')} /></label>
        {suggestionsOpen && <>
          {suggestionBusy && <p className="mailbox-suggestions__loading" role="status"><span className="mailbox-action-spinner" aria-hidden="true" />{w('Antwortvorschlag wird formuliert …', 'Writing a reply suggestion …')}</p>}
          {suggestionError && <Failure message={suggestionError} retry={!locked && !suggestionBusy ? suggest : undefined} />}
          {draft.suggestion && <MailboxKnowledgeNote knowledge={draft.suggestionKnowledge} />}
          {draft.suggestion && <div className="mailbox-suggestions__proposal"><h3>{w('Antwortvorschlag', 'Suggested reply')}</h3><p className="mailbox-suggestions__text">{draft.suggestion}</p><div className="mailbox-reply-buttons"><button type="button" disabled={locked || suggestionBusy} onClick={() => { setUndoBody(draft.body); update('body', draft.suggestion) }}>{w('Übernehmen', 'Use suggestion')}</button>{undoBody !== null && <button type="button" disabled={locked} onClick={() => { update('body', undoBody); setUndoBody(null) }}>{w('Rückgängig', 'Undo')}</button>}</div></div>}
          <button type="button" className="mailbox-suggestions__generate" disabled={locked || suggestionBusy} onClick={suggest}>{w('Neu formulieren', 'Rewrite')}</button>
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
