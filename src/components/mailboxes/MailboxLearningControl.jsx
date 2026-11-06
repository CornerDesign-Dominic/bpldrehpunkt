import { useEffect, useRef, useState } from 'react'
import { mailboxCall } from '../../lib/mailboxes.js'
import { useLanguage } from '../../i18n/useLanguage.js'

export default function MailboxLearningControl({ connectionId, managedScopeId, editable = false, admin = false }) {
  const { language } = useLanguage()
  const w = (de, en) => language === 'en' ? en : de
  const key = connectionId || managedScopeId || ''
  const currentKey = useRef(key)
  useEffect(() => { currentKey.current = key; return () => { currentKey.current = '' } }, [key])
  const [record, setRecord] = useState(null)
  const [busyKey, setBusyKey] = useState('')
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const settings = record?.key === key ? record.value : null
  const busy = busyKey === key && Boolean(key)
  useEffect(() => {
    if (!key) return
    let active = true
    const load = () => mailboxCall('getMailboxLearningSettings', connectionId ? { connectionId } : { managedScopeId }).then(value => {
      if (active) { setRecord({ key, value }); setError('') }
    }).catch(() => { if (active) setError(language === 'en' ? 'Could not load learning setting.' : 'Lerneinstellung konnte nicht geladen werden.') })
    void load()
    window.addEventListener('drehpunkt:mail-learning-changed', load)
    window.addEventListener('focus', load)
    return () => { active = false; window.removeEventListener('drehpunkt:mail-learning-changed', load); window.removeEventListener('focus', load) }
  }, [key, connectionId, managedScopeId, reload, language])
  async function change(enabled) {
    if (busy || !editable || !connectionId && enabled) return
    const requestedKey = key
    setBusyKey(requestedKey); setError('')
    try {
      const value = await mailboxCall('setMailboxLearningSettings', connectionId ? { connectionId, enabled } : { managedScopeId, enabled: false })
      if (currentKey.current === requestedKey) setRecord({ key: requestedKey, value })
      window.dispatchEvent(new Event('drehpunkt:mail-learning-changed'))
    } catch { if (currentKey.current === requestedKey) setError(w('Lerneinstellung konnte nicht gespeichert werden.', 'Could not save learning setting.')) }
    finally { setBusyKey(current => current === requestedKey ? '' : current) }
  }
  const readonly = settings?.managed && !admin
  const lastCaptured = settings?.lastCapturedAt ? new Date(settings.lastCapturedAt) : null
  const statusError = settings?.enabled && ['error', 'permission_required', 'missed'].includes(settings.state)
  return <div className="mailbox-learning-control" aria-busy={busy}>
    {readonly ? <span><strong>{w('Postfach zum Lernen verwenden', 'Use mailbox for learning')}</strong>: {settings.enabled ? w('zentral aktiviert', 'centrally enabled') : w('zentral deaktiviert', 'centrally disabled')} · {w('Verwaltung im Adminbereich', 'Managed by administrators')}</span> : settings || !key ? <label>
      <input type="checkbox" checked={settings?.enabled === true} disabled={!key || busy || !editable || !connectionId && !settings?.enabled} onChange={event => void change(event.target.checked)} />
      <strong>{w('Postfach zum Lernen verwenden', 'Use mailbox for learning')}</strong>
    </label> : !error && <span role="status">{w('Lerneinstellung wird geladen …', 'Loading learning setting …')}</span>}
    <small>{w('Unabhängig von automatischer KI. Neue versendete Antworten aus Drehpunkt oder Outlook werden mit der Eingangsmail gesammelt und zugeordnet. Keine Entwürfe oder Anhänge. Lernen wird weiterhin manuell gestartet.', 'Independent of automatic AI. New replies sent from Drehpunkt or Outlook are collected with the incoming message and assigned. No drafts or attachments. Learning is still started manually.')}</small>
    {!key && <small>{w('Postfach zuerst verbinden.', 'Connect the mailbox first.')}</small>}
    {settings?.enabled && settings.state === 'connecting' && <small role="status">{w('Verbindung für gesendete Antworten wird eingerichtet …', 'Setting up the connection for sent replies …')}</small>}
    {settings?.enabled && settings.state === 'active' && <small>{lastCaptured && !Number.isNaN(lastCaptured.getTime()) ? w('Letzte Antwort gesammelt: ', 'Last reply collected: ') + lastCaptured.toLocaleString(language === 'en' ? 'en-GB' : 'de-DE', { timeZone: 'Europe/Berlin' }) : w('Wartet auf eine neue versendete Antwort.', 'Waiting for a new sent reply.')}</small>}
    {statusError && <small role="status">{w('Lern-Verbindung oder Microsoft-Freigabe prüfen. Verpasste Antworten werden nicht nachgeholt.', 'Check the learning connection or Microsoft permission. Missed replies are not recovered.')}</small>}
    {statusError && !readonly && editable && connectionId && <button className="button button--secondary" type="button" disabled={busy} onClick={() => void change(true)}>{w('Lern-Verbindung prüfen', 'Check learning connection')}</button>}
    {error && <span className="form-error" role="alert">{error} <button className="button button--secondary" type="button" disabled={busy} onClick={() => setReload(value => value + 1)}>{w('Erneut laden', 'Reload')}</button></span>}
  </div>
}
