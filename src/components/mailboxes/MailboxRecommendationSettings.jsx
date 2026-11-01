import { useEffect, useState } from 'react'
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
    {settings && !settings.managed && <small>{w('Neue Eingangsmails · Betreff und Mailtext · etwa alle fünf Minuten', 'New incoming mail · subject and body · about every five minutes')}</small>}
    {settings?.enabled && <small>{settings.lastCheckedAt ? w('Zuletzt geprüft: ', 'Last checked: ') + new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }).format(new Date(settings.lastCheckedAt)) : w('Wartet auf die erste Prüfung.', 'Waiting for the first check.')}</small>}
    {settings?.state === 'error' && <span role="status">{w('Die letzte Prüfung war unvollständig. Microsoft-Verbindung und Zugriff prüfen; es wird erneut versucht.', 'The last check was incomplete. Check the Microsoft connection and permissions; it will retry.')}</span>}
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
    setBusy(item.connectionId); setError('')
    try {
      const settings = await mailboxCall('setMailboxRecommendationSettings', { connectionId: item.connectionId, enabled })
      setMailboxes(current => current.map(row => row.connectionId === item.connectionId ? { ...row, ...settings } : row))
      window.dispatchEvent(new Event('drehpunkt:mail-recommendations-changed'))
    } catch { setError(w('Einstellung konnte nicht gespeichert werden.', 'Could not save setting.')) }
    finally { setBusy('') }
  }
  return <section className="admin-panel"><div className="admin-panel__heading"><div><h2>{w('Postfächer · KI-Handlungsempfehlungen', 'Mailboxes · AI action recommendations')}</h2><p>{w('Gemeinsame Postfächer zentral aktivieren. Neue Eingangsmails werden etwa alle fünf Minuten einmal eingeordnet; alle Nutzer sehen dieselbe Empfehlung. Keine automatische Ausführung und keine Anhangauswertung.', 'Enable shared mailboxes centrally. New mail is classified about every five minutes; all users see the same recommendation. No automatic actions or attachment analysis.')}</p></div></div>
    {loading && <p role="status">{w('Postfächer werden geladen …', 'Loading mailboxes …')}</p>}
    {error && <p className="form-error" role="alert">{error} <button className="button button--secondary" type="button" onClick={() => setReload(value => value + 1)}>{w('Erneut laden', 'Reload')}</button></p>}
    {!loading && !mailboxes.length && !error && <p>{w('Noch keine freigegebenen Postfächer in Drehpunkt verbunden. Diese zuerst im Profil hinzufügen.', 'No shared mailbox connected in Drehpunkt yet. Add one in your profile first.')}</p>}
    <div className="managed-mailbox-recommendations">{mailboxes.map(item => <div key={item.connectionId}><label><input type="checkbox" checked={item.enabled} disabled={Boolean(busy)} onChange={event => toggle(item, event.target.checked)} /><strong>{item.email}</strong></label><span>{item.state === 'error' ? w('Prüfung unvollständig · Microsoft-Verbindung/Zugriff prüfen', 'Check incomplete · check Microsoft connection/access') : item.enabled ? w('Aktiv · für alle Nutzer', 'Enabled · for all users') : w('Deaktiviert', 'Disabled')}</span></div>)}</div>
    <p>{w('Persönliche Postfächer aktiviert jeder Nutzer selbst unter Mein Profil → Postfächer. Es werden nur Mails ab Aktivierung berücksichtigt. Eine gültige Microsoft-Verbindung mit Zugriff auf das gemeinsame Postfach muss bestehen.', 'Users enable personal mailboxes under My profile → Mailboxes. Only mail received after activation is considered. A valid Microsoft connection with access to the shared mailbox must remain available.')}</p>
  </section>
}
