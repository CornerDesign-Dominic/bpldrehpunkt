import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { mailboxCall } from '../../lib/mailboxes.js'
import { useLanguage } from '../../i18n/useLanguage.js'
import '../../styles/mailbox-ai-settings.css'

const settingMode = setting => ['off', 'recommend', 'automatic'].includes(setting?.mode) ? setting.mode : setting?.enabled ? 'recommend' : 'off'

function modeLabel(mode, w) {
  return mode === 'automatic' ? w('Postfach auslesen und bearbeiten', 'Analyze mailbox and prepare actions') : mode === 'recommend' ? w('Handlungsempfehlungen', 'Action recommendations') : w('Keine automatische KI', 'No automatic AI')
}

function MailboxAiModes({ value, onChange, disabled, unavailable = false, w }) {
  const name = useId()
  const options = [
    ['off', w('Keine automatische KI, keine Empfehlungen oder Auswertungen. Manuelle Aktionen bleiben verfügbar.', 'No automatic AI, recommendations or analysis. Manual actions remain available.')],
    ['recommend', w('Neue Mails einordnen und passende Aktionen empfehlen.', 'Classify new mail and recommend suitable actions.')],
    ['automatic', w('Rechnungsprüfung, AGB-Prüfung und Status automatisch auswerten. Ergebnisse wie bei manueller Auslösung prüfen; kein automatisches Senden oder Übernehmen. Auftrag und Mahnung bleiben manuell.', 'Automatically run invoice, terms and shipment status analysis. Review the results just as with manual actions; no automatic sending or acceptance. Orders and reminders remain manual.')],
  ]
  return <fieldset className="mailbox-ai-modes" disabled={disabled}>
    <legend>{w('Automatische KI für neue Mails', 'Automatic AI for new mail')}</legend>
    {options.map(([mode, description]) => <label key={mode} className={value === mode ? 'is-selected' : ''}>
      <input type="radio" name={name} value={mode} checked={value === mode} disabled={unavailable && mode !== 'off'} onChange={() => onChange(mode)} />
      <span><strong>{modeLabel(mode, w)}</strong><small>{description}</small></span>
    </label>)}
  </fieldset>
}

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
  async function changeMode(mode) {
    setBusy(true); setError('')
    try {
      setSettings(await mailboxCall('setMailboxRecommendationSettings', { connectionId: connection.id, mode }))
      window.dispatchEvent(new Event('drehpunkt:mail-recommendations-changed'))
    } catch { setError(w('Einstellung konnte nicht gespeichert werden.', 'Could not save setting.')) }
    finally { setBusy(false) }
  }
  const mode = settingMode(settings)
  return <div className="profile-mailbox-recommendations" aria-busy={busy}>
    {settings?.managed ? <span>{modeLabel(mode, w)} · {w('Zentral im Adminbereich verwaltet', 'Managed centrally by administrators')}</span> : settings ? <MailboxAiModes value={mode} disabled={busy || !editable} onChange={changeMode} w={w} /> : !error && <span>{w('KI-Einstellung wird geladen …', 'Loading AI setting …')}</span>}
    {settings && !settings.managed && mode !== 'off' && <small>{w('Nur neue Eingangsmails ab Aktivierung · Direkt von Microsoft · Keine regelmäßigen Kontrollabfragen', 'Only new incoming mail after activation · Microsoft push notifications · No polling')}</small>}
    {settings?.enabled && settings.state === 'active' && <small>{settings.lastCheckedAt ? w('Zuletzt geprüft: ', 'Last checked: ') + new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }).format(new Date(settings.lastCheckedAt)) : w('Wartet auf eine neue Mail.', 'Waiting for new mail.')}</small>}
    {settings?.enabled && settings.state === 'connecting' && <small role="status">{w('Webhook-Verbindung wird eingerichtet …', 'Setting up the webhook connection …')}</small>}
    {settings?.enabled && ['error', 'permission_required', 'missed'].includes(settings.state) && <span role="status">{w('Webhook-Verbindung oder Microsoft-Freigabe prüfen. Verpasste Mails werden nicht nachgeholt.', 'Check the webhook connection or Microsoft permission. Missed mail is not recovered.')}</span>}
    {settings?.enabled && ['error', 'permission_required', 'missed', 'connecting'].includes(settings.state) && !settings.managed && editable && <button className="button button--secondary" type="button" disabled={busy} onClick={() => changeMode(mode)}>{w('Webhook-Verbindung prüfen', 'Check webhook connection')}</button>}
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
  async function changeMode(item, mode) {
    const available = item.available !== false && Boolean(item.connectionId)
    if (!available && !(item.enabled === true && item.scopeId && mode === 'off')) return
    setBusy(item.email); setError('')
    try {
      const settings = await mailboxCall('setMailboxRecommendationSettings', available ? { connectionId: item.connectionId, mode } : { managedScopeId: item.scopeId, mode: 'off' })
      setMailboxes(current => current.map(row => row.email === item.email || (item.scopeId && row.scopeId === item.scopeId) ? { ...row, ...settings, functional: row.functional } : row))
      window.dispatchEvent(new Event('drehpunkt:mail-recommendations-changed'))
    } catch { setError(w('Einstellung konnte nicht gespeichert werden.', 'Could not save setting.')) }
    finally { setBusy('') }
  }
  function status(item, available) {
    if (!available && ['error', 'permission_required'].includes(item.state)) return item.enabled ? w('Aktiviert · Microsoft-Verbindung prüfen', 'Enabled · check Microsoft connection') : w('Microsoft-Verbindung prüfen', 'Check Microsoft connection')
    if (!available) return item.enabled ? w('Aktiviert · Postfach nicht verbunden', 'Enabled · mailbox not connected') : w('Noch nicht verbunden', 'Not connected yet')
    if (!item.enabled) return w('Keine automatische KI', 'No automatic AI')
    if (['error', 'permission_required'].includes(item.state)) return w('Microsoft-Verbindung/Zugriff prüfen', 'Check Microsoft connection/access')
    if (item.state === 'missed') return w('Benachrichtigung verpasst · Verbindung prüfen', 'Notification missed · check connection')
    if (item.state === 'connecting') return w('Verbindung wird eingerichtet …', 'Setting up connection …')
    return item.state === 'active' ? w('Aktiv · für alle Nutzer', 'Enabled · for all users') : w('Aktivierung wird vorbereitet …', 'Preparing activation …')
  }
  return <section className="admin-panel"><div className="admin-panel__heading"><div><h2>{w('Postfächer · Automatische KI', 'Mailboxes · Automatic AI')}</h2><p>{w('Funktionspostfächer und freigegebene Postfächer zentral verwalten. Eine Einstellung gilt für alle Nutzer. Microsoft meldet neue Eingangsmails direkt.', 'Manage functional and shared mailboxes centrally. One setting applies to all users. Microsoft sends notifications for new incoming mail.')}</p></div></div>
    {loading && <p role="status">{w('Postfächer werden geladen …', 'Loading mailboxes …')}</p>}
    {error && <p className="form-error" role="alert">{error} <button className="button button--secondary" type="button" onClick={() => setReload(value => value + 1)}>{w('Erneut laden', 'Reload')}</button></p>}
    {!loading && !mailboxes.length && !error && <p>{w('Noch keine freigegebenen Postfächer in Drehpunkt verbunden. Diese zuerst im Profil hinzufügen.', 'No shared mailbox connected in Drehpunkt yet. Add one in your profile first.')}</p>}
    <div className="managed-mailbox-recommendations">{mailboxes.map(item => {
      const available = item.available !== false && Boolean(item.connectionId)
      const canDisable = item.enabled === true && Boolean(item.scopeId)
      return <div key={item.email} aria-busy={busy === item.email}>
        <div className="managed-mailbox-recommendations__identity"><strong>{item.email}</strong>{item.functional && <small>{w('Gemeinsam genutztes Funktionspostfach', 'Shared functional mailbox')}</small>}</div>
        <div className="managed-mailbox-recommendations__status"><span role="status">{busy === item.email ? w('Einstellung wird gespeichert …', 'Saving setting …') : status(item, available)}</span>{available && item.enabled && ['error', 'permission_required', 'missed', 'connecting'].includes(item.state) && <button className="button button--secondary" type="button" disabled={Boolean(busy)} onClick={() => changeMode(item, settingMode(item))}>{w('Webhook-Verbindung prüfen', 'Check webhook connection')}</button>}</div>
        <MailboxAiModes value={settingMode(item)} disabled={(!available && !canDisable) || Boolean(busy)} unavailable={!available} onChange={mode => changeMode(item, mode)} w={w} />
      </div>
    })}</div>
    {!loading && mailboxes.some(item => item.available === false || !item.connectionId) && <p>{w('Noch nicht verbundene Postfächer zuerst unter ', 'First add unconnected mailboxes under ')}<Link className="managed-mailbox-recommendations__profile-link" to="/profil?tab=mailboxes">{w('Mein Profil → Postfächer', 'My profile → Mailboxes')}</Link>{w(' hinzufügen. Danach kann die automatische KI hier aktiviert werden.', '. Then enable automatic AI here.')}</p>}
    <p>{w('Persönliche Postfächer stellt jeder Nutzer selbst unter Mein Profil → Postfächer ein. Nur neue Mails ab Aktivierung werden berücksichtigt. Für gemeinsame Postfächer muss der begrenzte Microsoft-Anwendungszugriff eingerichtet sein.', 'Users configure personal mailboxes under My profile → Mailboxes. Only new mail after activation is considered. Shared mailboxes require scoped Microsoft application access.')}</p>
    <p>{w('Nur höchstens fünf Minuten alte Eingänge. Verpasste Benachrichtigungen werden bewusst nicht durch Kontrollabfragen nachgeholt.', 'Only incoming mail received within the last five minutes. Missed notifications are deliberately not recovered by polling.')}</p>
  </section>
}
