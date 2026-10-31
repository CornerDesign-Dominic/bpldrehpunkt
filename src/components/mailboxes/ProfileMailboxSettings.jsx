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

function MailboxName({ connection, editable, busy, onSave, onDisconnect, onReconnect }) {
  const { language } = useLanguage()
  const w = (de, en) => language === 'en' ? en : de
  const stored = connection.customName || ''
  const [editing, setEditing] = useState({ base: stored, value: stored })
  const value = editing.value === editing.base ? stored : editing.value
  return <div className="profile-mailbox">
    <div className="profile-mailbox__identity"><strong>{mailboxLabel(connection)}</strong><span>{connection.email}</span><small>{connection.kind === 'shared' ? w(`Freigegeben · über ${connection.parentEmail}`, `Shared · via ${connection.parentEmail}`) : w('Persönliches Microsoft-Konto', 'Personal Microsoft account')}</small></div>
    {connection.status === 'disconnecting' ? <p role="status">{w('Die Trennung wurde noch nicht abgeschlossen. Bitte erneut trennen.', 'Disconnection is incomplete. Please disconnect again.')}</p> : <>
      {editable && <form className="profile-mailbox__name" onSubmit={async event => {
        event.preventDefault()
        if (await onSave(connection.id, value)) setEditing({ base: value.trim(), value: value.trim() })
      }}><label htmlFor={`mailbox-name-${connection.id}`}>{w('Name in der Navigation', 'Name in navigation')}</label><div><input id={`mailbox-name-${connection.id}`} type="text" maxLength={80} value={value} placeholder={connection.email} disabled={busy} onChange={event => setEditing({ base: stored, value: event.target.value })} /><button className="button button--secondary" type="submit" disabled={busy || value.trim() === stored}>{w('Name speichern', 'Save name')}</button></div><small>{w('Ohne eigenen Namen wird die Mailadresse angezeigt.', 'Leave empty to display the email address.')}</small></form>}
      <Link to={mailboxUrl(connection.id)}>{w('Postfach öffnen', 'Open mailbox')}</Link>
    </>}
    {editable && connection.kind !== 'shared' && <button className="button button--secondary" type="button" disabled={busy} onClick={() => onReconnect(connection.email)}>{w('Microsoft-Verbindung erneuern', 'Reconnect Microsoft account')}</button>}
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
  const [shared, setShared] = useState({ parentConnectionId: '', email: '', customName: '' })
  const personalAccounts = connections.filter(item => item.kind !== 'shared' && item.status === 'connected')
  const sharedParentId = personalAccounts.some(item => item.id === shared.parentConnectionId) ? shared.parentConnectionId : personalAccounts[0]?.id || ''
  const sharedParent = personalAccounts.find(item => item.id === sharedParentId)
  const editable = canEdit(profile, 'mailboxes')
  useEffect(() => {
    if (location.hash === '#postfaecher') sectionRef.current?.scrollIntoView({ block: 'start' })
  }, [location.key, location.hash])
  if (!canView(profile, 'mailboxes')) return null

  async function connect(loginHint) {
    setBusy(true); setActionError(''); setNotice('')
    try {
      const { proof, proofChallenge } = await createConnectionProof()
      sessionStorage.setItem(`drehpunkt.mailboxes.proof.${user.uid}`, proof)
      const result = await mailboxCall('beginMailboxConnection', { proofChallenge, ...(typeof loginHint === 'string' ? { loginHint } : {}) })
      const url = new URL(result.authorizationUrl)
      if (url.protocol !== 'https:' || url.hostname !== 'login.microsoftonline.com') throw new Error('Invalid authorization URL')
      window.location.assign(url.href)
    } catch { setActionError(w('Die Verbindung konnte nicht gestartet werden. Bitte erneut versuchen.', 'Could not start the connection. Please try again.')); setBusy(false) }
  }

  async function addShared(event) {
    event.preventDefault()
    setBusy(true); setActionError(''); setNotice('')
    try {
      await mailboxCall('addSharedMailbox', { connectionId: sharedParentId, email: shared.email.trim(), customName: shared.customName.trim() })
      await refresh()
      setShared(current => ({ ...current, email: '', customName: '' }))
      setNotice(w('Freigegebenes Postfach hinzugefügt.', 'Shared mailbox added.'))
    } catch (error) {
      setActionError(error?.code === 'functions/failed-precondition' ? w('Bitte zuerst die Microsoft-Verbindung erneuern und die zusätzlichen Postfachberechtigungen bestätigen.', 'Reconnect your Microsoft account and grant the additional mailbox permissions first.') : error?.code === 'functions/permission-denied' || error?.code === 'functions/not-found' ? w('Kein Zugriff auf dieses Postfach. Bitte Mailadresse und die Freigabe in Microsoft 365 prüfen.', 'No access to this mailbox. Check the email address and your Microsoft 365 permissions.') : error?.code === 'functions/invalid-argument' ? w('Bitte eine gültige Postfachadresse und einen Namen mit höchstens 80 Zeichen eingeben. Das eigene Postfach ist bereits verbunden.', 'Enter a valid mailbox address and a name with up to 80 characters. Your personal mailbox is already connected.') : w('Das Postfach konnte nicht hinzugefügt werden. Deine Eingaben bleiben erhalten. Bitte erneut versuchen.', 'Could not add the mailbox. Your input is preserved. Please try again.'))
    } finally { setBusy(false) }
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
      for (const child of connections.filter(item => item.parentConnectionId === pendingDisconnect.id)) clearMailboxDraftCache(user.uid, child.id)
      try { localStorage.removeItem(`drehpunkt.mailboxes.last.${user.uid}`) } catch { /* Optional navigation preference. */ }
      setNotice(w('Postfachverbindung getrennt.', 'Mailbox disconnected.'))
    } catch { setActionError(w('Die Verbindung konnte nicht vollständig getrennt werden. Bitte erneut versuchen.', 'Could not finish disconnecting. Please try again.')) }
    finally { setBusy(false); setPendingDisconnect(null) }
  }

  return <section ref={sectionRef} id="postfaecher" className="profile-section profile-mailboxes">
    <h2>{w('Meine Postfächer', 'My mailboxes')}</h2>
    <p>{w('Verbinde dein Microsoft-Konto und füge freigegebene Postfächer hinzu. Wähle für jedes Postfach einen Namen für die Navigation.', 'Connect your Microsoft account and add shared mailboxes. Choose a navigation name for each mailbox.')}</p>
    {params.get('connection') === 'pending' && <p role="status">{w('Microsoft-Verbindung wird bestätigt …', 'Confirming Microsoft connection …')}</p>}
    {params.get('connection') === 'success' && <p role="status">{w('Microsoft-Postfach wurde verbunden.', 'Microsoft mailbox connected.')}</p>}
    {params.get('connection') === 'error' && <p className="form-error" role="alert">{w('Die Verbindung konnte nicht bestätigt werden. Bitte in diesem Browser erneut verbinden.', 'Could not confirm the connection. Please reconnect in this browser.')}</p>}
    {notice && <p role="status">{notice}</p>}
    {(error || actionError) && <div className="form-error" role="alert"><p>{actionError || w('Postfächer konnten nicht geladen werden.', 'Could not load mailboxes.')}</p>{error && <button className="button button--secondary" type="button" disabled={loading} onClick={() => { void refresh() }}>{w('Erneut versuchen', 'Try again')}</button>}</div>}
    {loading && <p role="status">{w('Postfächer werden geladen …', 'Loading mailboxes …')}</p>}
    {!loading && !error && !connections.length && <p>{w('Noch kein Postfach verbunden.', 'No mailbox connected yet.')}</p>}
    <div className="profile-mailboxes__list">{connections.map(connection => <MailboxName key={connection.id} connection={connection} editable={editable} busy={busy} onSave={save} onDisconnect={setPendingDisconnect} onReconnect={connect} />)}</div>
    {editable && <button className="button" type="button" disabled={busy} onClick={() => connect()}>{busy ? w('Bitte warten …', 'Please wait …') : w('Eigenes Microsoft-Konto verbinden', 'Connect your Microsoft account')}</button>}
    {editable && <form className="profile-mailbox-shared" onSubmit={addShared}>
      <h3>{w('Freigegebenes Postfach hinzufügen', 'Add a shared mailbox')}</h3>
      <p>{w('Der Zugriff erfolgt über dein persönliches Microsoft-Konto. Eine separate Anmeldung am freigegebenen Postfach ist nicht nötig.', 'Access uses your personal Microsoft account. The shared mailbox needs no separate sign-in.')}</p>
      {!personalAccounts.length ? <p>{w('Verbinde zuerst dein eigenes Microsoft-Konto.', 'Connect your own Microsoft account first.')}</p> : <>
        <label>{w('Zugriff über', 'Access via')}<select value={sharedParentId} disabled={busy} onChange={event => setShared(current => ({ ...current, parentConnectionId: event.target.value }))}>{personalAccounts.map(item => <option key={item.id} value={item.id}>{item.email}</option>)}</select></label>
        {sharedParent?.sharedAccess !== true && <p role="status">{w('Erneuere zuerst die Microsoft-Verbindung, um freigegebene Postfächer zu nutzen.', 'Reconnect your Microsoft account first to use shared mailboxes.')} <button className="button button--secondary" type="button" disabled={busy} onClick={() => connect(sharedParent?.email)}>{w('Verbindung erneuern', 'Reconnect')}</button></p>}
        <label>{w('Mailadresse des freigegebenen Postfachs', 'Shared mailbox email address')}<input type="email" required maxLength={254} autoComplete="off" disabled={busy} value={shared.email} onChange={event => setShared(current => ({ ...current, email: event.target.value }))} placeholder="rechnung@brennpunkt-logistik.de" /></label>
        <label>{w('Name in der Navigation (optional)', 'Navigation name (optional)')}<input type="text" maxLength={80} disabled={busy} value={shared.customName} onChange={event => setShared(current => ({ ...current, customName: event.target.value }))} placeholder={w('Zum Beispiel: Rechnungseingang', 'For example: Invoices')} /></label>
        <button className="button button--secondary" type="submit" disabled={busy || sharedParent?.sharedAccess !== true}>{busy ? w('Bitte warten …', 'Please wait …') : w('Postfach prüfen und hinzufügen', 'Check and add mailbox')}</button>
      </>}
    </form>}
    <ConfirmDialog open={Boolean(pendingDisconnect)} title={w('Postfachverbindung trennen', 'Disconnect mailbox')} message={w(`„${mailboxLabel(pendingDisconnect)}“ von Drehpunkt trennen? ${pendingDisconnect?.kind !== 'shared' ? 'Darüber eingebundene freigegebene Postfächer werden ebenfalls entfernt. ' : ''}Ungespeicherte Antwortentwürfe werden verworfen. Nachrichten bei Microsoft bleiben erhalten.`, `Disconnect “${mailboxLabel(pendingDisconnect)}” from Drehpunkt? ${pendingDisconnect?.kind !== 'shared' ? 'Shared mailboxes connected through it will also be removed. ' : ''}Unsaved reply drafts will be discarded. Messages in Microsoft remain.`)} onCancel={() => setPendingDisconnect(null)} onConfirm={confirmDisconnect} isSubmitting={busy} />
  </section>
}
