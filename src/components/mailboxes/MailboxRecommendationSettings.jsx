import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { mailboxCall } from '../../lib/mailboxes.js'
import { useLanguage } from '../../i18n/useLanguage.js'

export function MailboxRecommendationControl({ connection, editable }) {
  const { language } = useLanguage()
  const w = (de, en) => language === 'en' ? en : de
  const [settings, setSettings] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    const load = () => mailboxCall('getMailboxRecommendationSettings', { connectionId: connection.id }).then(value => { if (active) { setSettings(value); setError('') } }).catch(() => { if (active) setError(w('Einstellung konnte nicht geladen werden.', 'Could not load setting.')) })
    void load()
    window.addEventListener('drehpunkt:mail-recommendations-changed', load)
    window.addEventListener('focus', load)
    return () => { active = false; window.removeEventListener('drehpunkt:mail-recommendations-changed', load); window.removeEventListener('focus', load) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.id, reload, language])
  async function toggle(enabled) {
    setBusy(true); setError('')
    try {
      setSettings(await mailboxCall('setMailboxRecommendationSettings', { connectionId: connection.id, enabled }))
      window.dispatchEvent(new Event('drehpunkt:mail-recommendations-changed'))
    } catch { setError(w('Einstellung konnte nicht gespeichert werden.', 'Could not save setting.')) }
    finally { setBusy(false) }
  }
  return <div className="profile-mailbox-recommendations">
    {settings?.managed ? <span>{w('KI-Handlungsempfehlungen', 'AI action recommendations')}: {settings.enabled ? w('zentral aktiviert', 'centrally enabled') : w('zentral deaktiviert', 'centrally disabled')} · {w('Verwaltung im Adminbereich', 'Managed by administrators')}</span> : settings ? <label><input type="checkbox" checked={settings.enabled} disabled={busy || !editable} onChange={event => toggle(event.target.checked)} />{w('KI-Handlungsempfehlungen für neue Mails', 'AI action recommendations for new mail')}</label> : !error && <span>{w('KI-Einstellung wird geladen …', 'Loading AI setting …')}</span>}
    {settings && !settings.managed && <small>{w('Neue Eingangsmails · Betreff und Mailtext · Benachrichtigung direkt von Microsoft', 'New incoming mail · subject and body · Microsoft push notifications')}</small>}
    {settings?.enabled && settings.state === 'active' && <small>{settings.lastCheckedAt ? w('Zuletzt geprüft: ', 'Last checked: ') + new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }).format(new Date(settings.lastCheckedAt)) : w('Wartet auf eine neue Mail.', 'Waiting for new mail.')}</small>}
    {settings?.enabled && settings.state === 'connecting' && <small role="status">{w('Webhook-Verbindung wird eingerichtet …', 'Setting up the webhook connection …')}</small>}
    {['error', 'permission_required', 'missed'].includes(settings?.state) && <span role="status">{w('Webhook-Verbindung oder Microsoft-Freigabe prüfen. Verpasste Empfehlungen werden nicht nachgeholt.', 'Check the webhook connection or Microsoft permission. Missed recommendations are not recovered.')}</span>}
    {settings?.enabled && ['error', 'permission_required', 'missed', 'connecting'].includes(settings.state) && !settings.managed && editable && <button className="button button--secondary" type="button" disabled={busy} onClick={() => toggle(true)}>{w('Webhook-Verbindung prüfen', 'Check webhook connection')}</button>}
    {error && <span role="alert">{error} <button className="button button--secondary" type="button" onClick={() => setReload(value => value + 1)}>{w('Erneut laden', 'Reload')}</button></span>}
  </div>
}

export default function ManagedMailboxRecommendationsPanel() {
  const { language } = useLanguage()
  const w = (de, en) => language === 'en' ? en : de
  const [mailboxes, setMailboxes] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    mailboxCall('listManagedMailboxRecommendations').then(value => { if (active) { setMailboxes(value.mailboxes); setError('') } }).catch(() => { if (active) setError(w('Postfacheinstellungen konnten nicht geladen werden.', 'Could not load mailbox settings.')) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, language])
  async function toggle(item, enabled) {
    const available = item.available !== false && Boolean(item.connectionId)
    if (!available && !(item.enabled === true && item.scopeId && enabled === false)) return
    setBusy(item.email); setError('')
    try {
      const settings = await mailboxCall('setMailboxRecommendationSettings', available ? { connectionId: item.connectionId, enabled } : { managedScopeId: item.scopeId, enabled: false })
      setMailboxes(current => current.map(row => row.email === item.email || (item.scopeId && row.scopeId === item.scopeId) ? { ...row, ...settings, functional: row.functional } : row))
      window.dispatchEvent(new Event('drehpunkt:mail-recommendations-changed'))
    } catch { setError(w('Einstellung konnte nicht gespeichert werden.', 'Could not save setting.')) }
    finally { setBusy('') }
  }
  function status(item, available) {
    if (!available && ['error', 'permission_required'].includes(item.state)) return item.enabled ? w('Aktiviert · Microsoft-Verbindung prüfen', 'Enabled · check Microsoft connection') : w('Microsoft-Verbindung prüfen', 'Check Microsoft connection')
    if (!available) return item.enabled ? w('Aktiviert · Postfach nicht verbunden', 'Enabled · mailbox not connected') : w('Noch nicht verbunden', 'Not connected yet')
    if (!item.enabled) return w('Deaktiviert', 'Disabled')
    if (['error', 'permission_required'].includes(item.state)) return w('Microsoft-Verbindung/Zugriff prüfen', 'Check Microsoft connection/access')
    if (item.state === 'missed') return w('Benachrichtigung verpasst · Verbindung prüfen', 'Notification missed · check connection')
    if (item.state === 'connecting') return w('Verbindung wird eingerichtet …', 'Setting up connection …')
    return item.state === 'active' ? w('Aktiv · für alle Nutzer', 'Enabled · for all users') : w('Aktivierung wird vorbereitet …', 'Preparing activation …')
  }
  return <section className="admin-panel"><div className="admin-panel__heading"><div><h2>{w('Postfächer · KI-Handlungsempfehlungen', 'Mailboxes · AI action recommendations')}</h2><p>{w('Funktionspostfächer und freigegebene Postfächer zentral verwalten. Microsoft meldet neue Eingangsmails direkt; alle Nutzer sehen dieselbe Empfehlung. Ausgewertet werden Betreff und Mailtext.', 'Manage functional and shared mailboxes centrally. Microsoft sends notifications for new mail; all users see the same recommendation. Analysis uses the subject and message body.')}</p></div></div>
    {loading && <p role="status">{w('Postfächer werden geladen …', 'Loading mailboxes …')}</p>}
    {error && <p className="form-error" role="alert">{error} <button className="button button--secondary" type="button" onClick={() => setReload(value => value + 1)}>{w('Erneut laden', 'Reload')}</button></p>}
    {!loading && !mailboxes.length && !error && <p>{w('Noch keine freigegebenen Postfächer in Drehpunkt verbunden. Diese zuerst im Profil hinzufügen.', 'No shared mailbox connected in Drehpunkt yet. Add one in your profile first.')}</p>}
    <div className="managed-mailbox-recommendations">{mailboxes.map(item => {
      const available = item.available !== false && Boolean(item.connectionId)
      const canDisable = item.enabled === true && Boolean(item.scopeId)
      return <div key={item.email} aria-busy={busy === item.email}>
        <div className="managed-mailbox-recommendations__identity"><label><input type="checkbox" checked={item.enabled === true} disabled={(!available && !canDisable) || Boolean(busy)} onChange={event => toggle(item, event.target.checked)} /><strong>{item.email}</strong></label>{item.functional && <small>{w('Gemeinsam genutztes Funktionspostfach', 'Shared functional mailbox')}</small>}</div>
        <div className="managed-mailbox-recommendations__status"><span role="status">{busy === item.email ? w('Einstellung wird gespeichert …', 'Saving setting …') : status(item, available)}</span>{available && item.enabled && ['error', 'permission_required', 'missed', 'connecting'].includes(item.state) && <button className="button button--secondary" type="button" disabled={Boolean(busy)} onClick={() => toggle(item, true)}>{w('Webhook-Verbindung prüfen', 'Check webhook connection')}</button>}</div>
      </div>
    })}</div>
    {!loading && mailboxes.some(item => item.available === false || !item.connectionId) && <p>{w('Noch nicht verbundene Postfächer zuerst unter ', 'First add unconnected mailboxes under ')}<Link className="managed-mailbox-recommendations__profile-link" to="/profil?tab=mailboxes">{w('Mein Profil → Postfächer', 'My profile → Mailboxes')}</Link>{w(' hinzufügen. Danach können die Empfehlungen hier aktiviert werden.', '. Then enable their recommendations here.')}</p>}
    <p>{w('Persönliche Postfächer aktiviert jeder Nutzer selbst unter Mein Profil → Postfächer. Es werden nur Mails ab Aktivierung berücksichtigt. Der begrenzte Microsoft-Anwendungszugriff für gemeinsame Postfächer muss eingerichtet sein.', 'Users enable personal mailboxes under My profile → Mailboxes. Only mail received after activation is considered. The scoped Microsoft application access for shared mailboxes must be configured.')}</p>
    <p>{w('Empfehlungen nur für höchstens fünf Minuten alte Mails. Verpasste Benachrichtigungen werden bewusst nicht durch Kontrollabfragen nachgeholt.', 'Recommendations are only generated within five minutes of receipt. Missed notifications are deliberately not recovered by polling.')}</p>
  </section>
}
