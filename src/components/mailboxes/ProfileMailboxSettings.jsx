import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth.js'
import { useLanguage } from '../../i18n/useLanguage.js'
import { canEdit, canView } from '../../lib/permissions.js'
import { createConnectionProof, mailboxLabel, mailboxUrl } from '../../lib/mailboxHelpers.js'
import { clearMailboxDraftCache } from '../../lib/mailboxDraftCache.js'
import { mailboxCall } from '../../lib/mailboxes.js'
import { useMailboxConnections } from '../../mailboxes/useMailboxConnections.js'
import ConfirmDialog from '../ui/ConfirmDialog.jsx'

function MailboxName({ connection, editable, busy, onSave, onDisconnect }) {
  const { language } = useLanguage()
  const w = (de, en) => language === 'en' ? en : de
  const stored = connection.customName || ''
  const [editing, setEditing] = useState({ base: stored, value: stored })
  const value = editing.value === editing.base ? stored : editing.value
  return <div className="profile-mailbox">
    <div className="profile-mailbox__identity"><strong>{mailboxLabel(connection)}</strong><span>{connection.email}</span></div>
    {connection.status === 'disconnecting' ? <p role="status">{w('Die Trennung wurde noch nicht abgeschlossen. Bitte erneut trennen.', 'Disconnection is incomplete. Please disconnect again.')}</p> : <>
      {editable && <form className="profile-mailbox__name" onSubmit={async event => {
        event.preventDefault()
        if (await onSave(connection.id, value)) setEditing({ base: value.trim(), value: value.trim() })
      }}><label htmlFor={`mailbox-name-${connection.id}`}>{w('Name in der Navigation', 'Name in navigation')}</label><div><input id={`mailbox-name-${connection.id}`} type="text" maxLength={80} value={value} placeholder={connection.email} disabled={busy} onChange={event => setEditing({ base: stored, value: event.target.value })} /><button className="button button--secondary" type="submit" disabled={busy || value.trim() === stored}>{w('Name speichern', 'Save name')}</button></div><small>{w('Ohne eigenen Namen wird die Mailadresse angezeigt.', 'Leave empty to display the email address.')}</small></form>}
      <Link to={mailboxUrl(connection.id)}>{w('Postfach öffnen', 'Open mailbox')}</Link>
    </>}
    {editable && <button className="button button--secondary" type="button" disabled={busy} onClick={() => onDisconnect(connection)}>{w('Verbindung trennen', 'Disconnect')}</button>}
  </div>
}

export default function ProfileMailboxSettings() {
  const { user, profile } = useAuth()
  const { language } = useLanguage()
  const w = (de, en) => language === 'en' ? en : de
  const { connections, loading, error, refresh, rename, disconnect } = useMailboxConnections()
  const [params] = useSearchParams()
  const location = useLocation()
  const sectionRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [pendingDisconnect, setPendingDisconnect] = useState(null)
  const editable = canEdit(profile, 'mailboxes')
  useEffect(() => {
    if (location.hash === '#postfaecher') sectionRef.current?.scrollIntoView({ block: 'start' })
  }, [location.key, location.hash])
  if (!canView(profile, 'mailboxes')) return null

  async function connect() {
    setBusy(true); setActionError(''); setNotice('')
    try {
      const { proof, proofChallenge } = await createConnectionProof()
      sessionStorage.setItem(`drehpunkt.mailboxes.proof.${user.uid}`, proof)
      const result = await mailboxCall('beginMailboxConnection', { proofChallenge })
      const url = new URL(result.authorizationUrl)
      if (url.protocol !== 'https:' || url.hostname !== 'login.microsoftonline.com') throw new Error('Invalid authorization URL')
      window.location.assign(url.href)
    } catch { setActionError(w('Die Verbindung konnte nicht gestartet werden. Bitte erneut versuchen.', 'Could not start the connection. Please try again.')); setBusy(false) }
  }

  async function save(connectionId, value) {
    setBusy(true); setActionError(''); setNotice('')
    try { await rename(connectionId, value); setNotice(w('Postfachname gespeichert.', 'Mailbox name saved.')); return true }
    catch { setActionError(w('Der Name konnte nicht gespeichert werden. Deine Eingabe bleibt erhalten.', 'Could not save the name. Your input is preserved.')); return false }
    finally { setBusy(false) }
  }

  async function confirmDisconnect() {
    setBusy(true); setActionError(''); setNotice('')
    try {
      await disconnect(pendingDisconnect.id)
      clearMailboxDraftCache(user.uid, pendingDisconnect.id)
      try { localStorage.removeItem(`drehpunkt.mailboxes.last.${user.uid}`) } catch { /* Optional navigation preference. */ }
      setNotice(w('Postfachverbindung getrennt.', 'Mailbox disconnected.'))
    } catch { setActionError(w('Die Verbindung konnte nicht vollständig getrennt werden. Bitte erneut versuchen.', 'Could not finish disconnecting. Please try again.')) }
    finally { setBusy(false); setPendingDisconnect(null) }
  }

  return <section ref={sectionRef} id="postfaecher" className="profile-section profile-mailboxes">
    <h2>{w('Meine Postfächer', 'My mailboxes')}</h2>
    <p>{w('Verbinde deine Microsoft-Postfächer und wähle die Namen für deine Navigation.', 'Connect your Microsoft mailboxes and choose their names in navigation.')}</p>
    {params.get('connection') === 'pending' && <p role="status">{w('Microsoft-Verbindung wird bestätigt …', 'Confirming Microsoft connection …')}</p>}
    {params.get('connection') === 'success' && <p role="status">{w('Microsoft-Postfach wurde verbunden.', 'Microsoft mailbox connected.')}</p>}
    {params.get('connection') === 'error' && <p className="form-error" role="alert">{w('Die Verbindung konnte nicht bestätigt werden. Bitte in diesem Browser erneut verbinden.', 'Could not confirm the connection. Please reconnect in this browser.')}</p>}
    {notice && <p role="status">{notice}</p>}
    {(error || actionError) && <div className="form-error" role="alert"><p>{actionError || w('Postfächer konnten nicht geladen werden.', 'Could not load mailboxes.')}</p>{error && <button className="button button--secondary" type="button" disabled={loading} onClick={() => { void refresh() }}>{w('Erneut versuchen', 'Try again')}</button>}</div>}
    {loading && <p role="status">{w('Postfächer werden geladen …', 'Loading mailboxes …')}</p>}
    {!loading && !error && !connections.length && <p>{w('Noch kein Postfach verbunden.', 'No mailbox connected yet.')}</p>}
    <div className="profile-mailboxes__list">{connections.map(connection => <MailboxName key={connection.id} connection={connection} editable={editable} busy={busy} onSave={save} onDisconnect={setPendingDisconnect} />)}</div>
    {editable && <button className="button" type="button" disabled={busy} onClick={connect}>{busy ? w('Bitte warten …', 'Please wait …') : w('Microsoft-Postfach verbinden', 'Connect Microsoft mailbox')}</button>}
    <ConfirmDialog open={Boolean(pendingDisconnect)} title={w('Postfachverbindung trennen', 'Disconnect mailbox')} message={w(`„${mailboxLabel(pendingDisconnect)}“ von Drehpunkt trennen? Ungespeicherte Antwortentwürfe werden verworfen. Nachrichten bei Microsoft bleiben erhalten.`, `Disconnect “${mailboxLabel(pendingDisconnect)}” from Drehpunkt? Unsaved reply drafts will be discarded. Messages in Microsoft remain.`)} onCancel={() => setPendingDisconnect(null)} onConfirm={confirmDisconnect} isSubmitting={busy} />
  </section>
}
