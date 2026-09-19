import { useEffect, useMemo, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { Link } from 'react-router-dom'
import AdminEmployeesTable from '../components/admin/AdminEmployeesTable.jsx'
import DepartmentManagementPanel from '../components/admin/DepartmentManagementPanel.jsx'
import CalendarManagementPanel from '../components/admin/CalendarManagementPanel.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import UserManagementForm from '../components/admin/UserManagementForm.jsx'
import Toast from '../components/ui/Toast.jsx'
import { useAuth } from '../auth/useAuth.js'
import { usePermissions } from '../auth/usePermissions.js'
import { getSafeProfileDefaults } from '../lib/permissions.js'
import { createDepartment, listDepartments, updateDepartment } from '../lib/departments.js'
import { createManagedUser, updateManagedUser } from '../lib/userManagement.js'
import { listManagedUserProfiles } from '../lib/userProfiles.js'
import { createCalendar, listCalendarPermissions, listCalendars, setCalendarPermissions as saveCalendarPermissions, updateCalendar } from '../lib/calendars.js'
import { getHolidaySyncStatus, getSchoolHolidaySyncStatus, listHolidaySyncLogs, listSchoolHolidaySyncLogs } from '../lib/holidayData.js'
import { GERMAN_STATES, getHolidayCountryName } from '../lib/holidayCalendar.js'
import { functions } from '../lib/firebase.js'
import '../styles/admin.css'
import PartnerEvaluationSettingsPanel from '../components/admin/PartnerEvaluationSettingsPanel.jsx'
import LegacyAccountReviewPanel from '../components/admin/LegacyAccountReviewPanel.jsx'
import CompanyHolidaySettingsPanel from '../components/admin/CompanyHolidaySettingsPanel.jsx'

const emptyUser = () => ({ firstName: '', lastName: '', email: '', departmentId: '', department: '', jobTitle: '', phone: '', personnelNumber: '', employmentStart: '', active: true, role: 'user', permissions: {}, vacationManager: false, vacationManagerAllDepartments: false, vacationManagerDepartments: [] })
const syncDateFormatter = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' })

function CountrySyncResults({ results }) {
  if (!Array.isArray(results) || !results.length) return null
  return <details className="admin-holiday-sync-log__countries"><summary>Länderergebnisse ({results.length})</summary><ul>{results.map((result) => <li key={result.countryCode}><strong>{getHolidayCountryName(result.countryCode)}</strong><span className={`admin-holiday-sync-log__country-status admin-holiday-sync-log__country-status--${result.status}`}>{result.status === 'success' ? `Erfolgreich · ${result.createdEntryCount || 0} neu · ${result.changedEntryCount || 0} geändert` : result.status === 'empty' ? 'Keine Feiertage geliefert' : `Fehlgeschlagen${result.errorMessage ? ` · ${result.errorMessage}` : ''}`}</span></li>)}</ul></details>
}

function HolidaySyncLog({ entries }) {
  return <><CompanyHolidaySettingsPanel /><section className="admin-panel admin-holiday-sync-log"><div className="admin-panel__heading"><div><h2>Aktualisierungsprotokoll</h2><p>Die letzten zehn Synchronisationsläufe.</p></div></div>{entries.length ? <div className="admin-holiday-sync-log__entries">{entries.map((entry) => {
    const date = entry.loggedAt?.toDate?.()
    const succeeded = entry.status === 'success'
    const created = entry.createdEntryCount || 0
    const changed = entry.changedEntryCount || 0
    const missingTranslations = Array.isArray(entry.translationMissing) ? entry.translationMissing : (Array.isArray(entry.translationMissingNames) ? entry.translationMissingNames.map((sourceName) => ({ countryCode: 'DE', sourceName })) : [])
    const failedCountries = Array.isArray(entry.failedCountries) ? entry.failedCountries : []
    const successfulCountryCount = entry.successfulCountryCount ?? (succeeded ? 1 : 0)
    return <div className="admin-holiday-sync-log__entry" key={entry.id}><div><strong>{date ? syncDateFormatter.format(date) : 'Zeitpunkt wird geladen …'}</strong><span>{entry.trigger === 'automatic' ? 'Automatisch' : entry.actorName || 'Administrator'}</span></div><div className="admin-holiday-sync-log__details"><span className={succeeded ? 'admin-holiday-sync-log__status admin-holiday-sync-log__status--success' : 'admin-holiday-sync-log__status admin-holiday-sync-log__status--failed'}>{succeeded ? (failedCountries.length ? 'Erfolgreich mit Teilfehlern' : (created || changed ? 'Erfolgreich' : 'Erfolgreich – keine Änderungen')) : 'Fehlgeschlagen'}</span><span>{created} neu · {changed} geändert</span><span>{successfulCountryCount} Länder aktualisiert</span>{failedCountries.length > 0 && <span className="admin-holiday-sync-log__error">Teilfehler: {failedCountries.map((item) => getHolidayCountryName(item.countryCode)).join(', ')}</span>}{missingTranslations.length > 0 && <span className="admin-holiday-sync-log__translation">Deutsche Übersetzung fehlt: {missingTranslations.map((item) => `${getHolidayCountryName(item.countryCode)} – ${item.sourceName}`).join(', ')}</span>}{!succeeded && entry.errorMessage && <span className="admin-holiday-sync-log__error">{entry.errorMessage}</span>}<CountrySyncResults results={entry.countryResults} /></div></div>
  })}</div> : <p className="admin-holiday-sync-log__empty">Noch keine Synchronisationsläufe vorhanden.</p>}</section></>
}

const germanStateNameBySubdivisionCode = Object.fromEntries(GERMAN_STATES.map((state) => [`DE-${state.code}`, state.name]))

function SchoolHolidaySyncLog({ entries }) {
  return <section className="admin-panel admin-holiday-sync-log"><div className="admin-panel__heading"><div><h2>Ferien-Aktualisierungsprotokoll</h2><p>Die letzten zehn Synchronisationsläufe.</p></div></div>{entries.length ? <div className="admin-holiday-sync-log__entries">{entries.map((entry) => {
    const date = entry.loggedAt?.toDate?.()
    const succeeded = entry.status === 'success'
    const created = entry.createdEntryCount || 0
    const changed = entry.changedEntryCount || 0
    const failedSubdivisions = Array.isArray(entry.failedSubdivisions) ? entry.failedSubdivisions : []
    const updatedStates = entry.successfulSubdivisionCount ?? (succeeded ? 1 : 0)
    return <div className="admin-holiday-sync-log__entry" key={entry.id}><div><strong>{date ? syncDateFormatter.format(date) : 'Zeitpunkt wird geladen …'}</strong><span>{entry.trigger === 'automatic' ? 'Automatisch' : entry.actorName || 'Administrator'}</span></div><div className="admin-holiday-sync-log__details"><span className={succeeded ? 'admin-holiday-sync-log__status admin-holiday-sync-log__status--success' : 'admin-holiday-sync-log__status admin-holiday-sync-log__status--failed'}>{succeeded ? (failedSubdivisions.length ? 'Erfolgreich mit Teilfehlern' : (created || changed ? 'Erfolgreich' : 'Erfolgreich – keine Änderungen')) : 'Fehlgeschlagen'}</span><span>{created} neu · {changed} geändert</span><span>{updatedStates} Bundesländer aktualisiert</span>{failedSubdivisions.length > 0 && <span className="admin-holiday-sync-log__error">Teilfehler: {failedSubdivisions.map((item) => germanStateNameBySubdivisionCode[item.subdivisionCode] || item.subdivisionCode).join(', ')}</span>}{!succeeded && entry.errorMessage && <span className="admin-holiday-sync-log__error">{entry.errorMessage}</span>}</div></div>
  })}</div> : <p className="admin-holiday-sync-log__empty">Noch keine Synchronisationsläufe vorhanden.</p>}</section>
}

export default function AdminPage() {
  const { profile } = useAuth()
  const { canManagePermissions } = usePermissions()
  const [users, setUsers] = useState([])
  const [departments, setDepartments] = useState([])
  const [calendars, setCalendars] = useState([])
  const [calendarPermissions, setCalendarPermissions] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [departmentError, setDepartmentError] = useState('')
  const [calendarError, setCalendarError] = useState('')
  const [editing, setEditing] = useState(null)
  const [isNew, setNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [departmentSaving, setDepartmentSaving] = useState(false)
  const [calendarSaving, setCalendarSaving] = useState(false)
  const [researching, setResearching] = useState(false)
  const [researchConfirmationOpen, setResearchConfirmationOpen] = useState(false)
  const [holidaySyncStatus, setHolidaySyncStatus] = useState(null)
  const [holidaySyncLogs, setHolidaySyncLogs] = useState([])
  const [holidaySyncing, setHolidaySyncing] = useState(false)
  const [schoolHolidaySyncStatus, setSchoolHolidaySyncStatus] = useState(null)
  const [schoolHolidaySyncLogs, setSchoolHolidaySyncLogs] = useState([])
  const [schoolHolidaySyncing, setSchoolHolidaySyncing] = useState(false)
  const [toast, setToast] = useState('')

  async function reload() {
    setLoading(true)
    setError('')
    try { setUsers(await listManagedUserProfiles()) } catch { setError('Mitarbeiterdaten konnten nicht geladen werden.') } finally { setLoading(false) }
    try { setDepartments(await listDepartments()); setDepartmentError('') } catch { setDepartments([]); setDepartmentError('Zentrale Abteilungen konnten nicht geladen werden.') }
    if (canManagePermissions) {
      try {
        const availableCalendars = await listCalendars()
        const permissionLists = await Promise.all(availableCalendars.filter((calendar) => calendar.kind === 'shared').map(async (calendar) => [calendar.id, await listCalendarPermissions(calendar.id)]))
        setCalendars(availableCalendars)
        setCalendarPermissions(Object.fromEntries(permissionLists.map(([calendarId, permissions]) => [calendarId, Object.fromEntries(permissions.map((permission) => [permission.userId, permission.level]))])))
        setCalendarError('')
      } catch { setCalendars([]); setCalendarPermissions({}); setCalendarError('Kalenderdaten konnten nicht geladen werden.') }
    }
  }

  useEffect(() => {
    let active = true
    listManagedUserProfiles()
      .then((profiles) => { if (active) setUsers(profiles) })
      .catch(() => { if (active) setError('Mitarbeiterdaten konnten nicht geladen werden.') })
      .finally(() => { if (active) setLoading(false) })
    listDepartments()
      .then((centralDepartments) => { if (active) { setDepartments(centralDepartments); setDepartmentError('') } })
      .catch(() => { if (active) { setDepartments([]); setDepartmentError('Zentrale Abteilungen konnten nicht geladen werden.') } })
    if (canManagePermissions) {
      listCalendars()
        .then(async (availableCalendars) => {
          const permissionLists = await Promise.all(availableCalendars.filter((calendar) => calendar.kind === 'shared').map(async (calendar) => [calendar.id, await listCalendarPermissions(calendar.id)]))
          if (active) {
            setCalendars(availableCalendars)
            setCalendarPermissions(Object.fromEntries(permissionLists.map(([calendarId, permissions]) => [calendarId, Object.fromEntries(permissions.map((permission) => [permission.userId, permission.level]))])))
            setCalendarError('')
          }
        })
        .catch(() => { if (active) { setCalendars([]); setCalendarPermissions({}); setCalendarError('Kalenderdaten konnten nicht geladen werden.') } })
    }
    return () => { active = false }
  }, [canManagePermissions])

  useEffect(() => {
    if (!['admin', 'superadmin'].includes(profile?.role) || profile?.active !== true) return undefined
    let active = true
    Promise.all([getHolidaySyncStatus('DE'), listHolidaySyncLogs('DE'), getSchoolHolidaySyncStatus('DE'), listSchoolHolidaySyncLogs('DE')])
      .then(([status, logs, schoolStatus, schoolLogs]) => { if (active) { setHolidaySyncStatus(status); setHolidaySyncLogs(logs); setSchoolHolidaySyncStatus(schoolStatus); setSchoolHolidaySyncLogs(schoolLogs) } })
      .catch(() => { if (active) { setHolidaySyncStatus(null); setHolidaySyncLogs([]); setSchoolHolidaySyncStatus(null); setSchoolHolidaySyncLogs([]) } })
    return () => { active = false }
  }, [profile?.active, profile?.role])

  useEffect(() => {
    if (profile?.role !== 'superadmin' || profile?.active !== true) return undefined
    let active = true
    httpsCallable(functions, 'migrateLegacyDamageDocuments')()
      .then((result) => {
        const migrated = result.data?.migrated || 0
        if (active && migrated) setToast(`${migrated} Schadenunterlage${migrated === 1 ? '' : 'n'} in die jeweilige Fallakte übernommen.`)
      })
      .catch((migrationError) => console.error('Administration: Schadenunterlagen konnten nicht migriert werden.', migrationError))
    return () => { active = false }
  }, [profile?.active, profile?.role])

  async function save(event) {
    event.preventDefault()
    setSaving(true); setError('')
    try {
      if (isNew) await createManagedUser(editing)
      else await updateManagedUser(editing.id, editing)
      await reload(); setEditing(null); setToast(isNew ? 'Mitarbeiter angelegt.' : 'Mitarbeiter aktualisiert.')
    } catch (saveError) {
      setError(saveError?.message?.replace(/^.*?:\s*/, '') || 'Mitarbeiter konnte nicht gespeichert werden.')
    } finally { setSaving(false) }
  }

  async function runNewsResearch() {
    setResearching(true)
    try {
      const result = await httpsCallable(functions, 'runAutomatedNewsResearch', { timeout: 550000 })()
      const created = result.data?.created || 0
      setToast(created ? `Recherche abgeschlossen: ${created} neue Meldung${created === 1 ? '' : 'en'}.` : 'Recherche abgeschlossen: keine neuen relevanten Meldungen.')
    } catch (researchError) {
      const message = researchError?.message?.replace(/^.*?:\s*/, '') || 'Unbekannter Fehler'
      setToast(`Die News-Recherche konnte nicht abgeschlossen werden: ${message}`)
    } finally {
      setResearching(false)
      setResearchConfirmationOpen(false)
    }
  }

  async function refreshHolidays() {
    setHolidaySyncing(true)
    try {
      const result = await httpsCallable(functions, 'refreshHolidayData', { timeout: 550000 })()
      const [status, logs] = await Promise.all([getHolidaySyncStatus('DE'), listHolidaySyncLogs('DE')])
      setHolidaySyncStatus(status)
      setHolidaySyncLogs(logs)
      const updated = result.data?.updatedEntryCount || 0
      setToast(updated ? `Feiertage aktualisiert: ${updated} Eintrag${updated === 1 ? '' : 'e'} geändert.` : 'Feiertage geprüft: keine Änderungen erforderlich.')
    } catch (holidayError) {
      const message = holidayError?.message?.replace(/^.*?:\s*/, '') || 'Unbekannter Fehler'
      setToast(`Feiertage konnten nicht aktualisiert werden: ${message}`)
    } finally {
      setHolidaySyncing(false)
    }
  }

  async function refreshSchoolHolidays() {
    setSchoolHolidaySyncing(true)
    try {
      const result = await httpsCallable(functions, 'refreshSchoolHolidayData', { timeout: 550000 })()
      const [status, logs] = await Promise.all([getSchoolHolidaySyncStatus('DE'), listSchoolHolidaySyncLogs('DE')])
      setSchoolHolidaySyncStatus(status)
      setSchoolHolidaySyncLogs(logs)
      const updated = result.data?.updatedEntryCount || 0
      setToast(updated ? `Ferien aktualisiert: ${updated} Eintrag${updated === 1 ? '' : 'e'} geändert.` : 'Ferien geprüft: keine Änderungen erforderlich.')
    } catch (schoolHolidayError) {
      const message = schoolHolidayError?.message?.replace(/^.*?:\s*/, '') || 'Unbekannter Fehler'
      setToast(`Ferien konnten nicht aktualisiert werden: ${message}`)
    } finally {
      setSchoolHolidaySyncing(false)
    }
  }

  async function saveDepartment(action) {
    setDepartmentSaving(true)
    setError('')
    try {
      await action()
      await reload()
      setToast('Abteilungen wurden aktualisiert.')
      return true
    } catch (saveError) {
      setError(saveError?.message?.replace(/^.*?:\s*/, '') || 'Abteilung konnte nicht gespeichert werden.')
      return false
    } finally {
      setDepartmentSaving(false)
    }
  }

  async function saveCalendar(action, successMessage = 'Kalender wurden aktualisiert.') {
    setCalendarSaving(true)
    setError('')
    try {
      const result = await action()
      await reload()
      setToast(successMessage)
      return result || true
    } catch (saveError) {
      setCalendarError(saveError?.message?.replace(/^.*?:\s*/, '') || 'Kalender konnte nicht gespeichert werden.')
      return false
    } finally {
      setCalendarSaving(false)
    }
  }

  const orderedDepartments = useMemo(() => [...departments].sort((left, right) => String(left.name).localeCompare(String(right.name), 'de')), [departments])
  const isActiveSuperadmin = profile?.role === 'superadmin' && profile?.active === true
  const isActiveAdmin = ['admin', 'superadmin'].includes(profile?.role) && profile?.active === true
  const holidaySyncDate = holidaySyncStatus?.lastSyncedAt?.toDate?.()
  const schoolHolidaySyncDate = schoolHolidaySyncStatus?.lastSyncedAt?.toDate?.()

  return <div className="admin-page"><ConfirmDialog open={researchConfirmationOpen} title="News-Recherche starten?" message="Die Recherche führt eine kostenpflichtige KI- und Websuche aus. Möchten Sie sie jetzt wirklich starten?" confirmLabel="Recherche starten" submittingLabel="Recherche läuft …" isSubmitting={researching} onCancel={() => setResearchConfirmationOpen(false)} onConfirm={runNewsResearch} />{toast && <Toast message={toast} onDismiss={() => setToast('')} />}{editing ? <UserManagementForm value={editing} isNew={isNew} canManagePermissions={canManagePermissions} departments={orderedDepartments} saving={saving} onChange={setEditing} onCancel={() => setEditing(null)} onSubmit={save} /> : <><section className="admin-panel"><div className="admin-panel__heading"><div><h2>Mitarbeiter</h2><p>Benutzerkonten und Stammdaten.</p></div><div className="admin-panel__actions"><button className="button" type="button" onClick={() => { setEditing(emptyUser()); setNew(true) }}>Mitarbeiter anlegen</button></div></div>{error && <p className="form-error">{error}</p>}<AdminEmployeesTable users={users} loading={loading} error={error} onManage={(user) => { setEditing(getSafeProfileDefaults(user)); setNew(false) }} /></section>{isActiveAdmin && <><section className="admin-panel admin-holiday-sync"><div className="admin-panel__heading"><div><h2>Feiertagskalender</h2><p>{holidaySyncDate ? `Zuletzt aktualisiert: ${syncDateFormatter.format(holidaySyncDate)} · ${holidaySyncStatus.source || 'Nager.Date'} · ${holidaySyncStatus.updatedEntryCount || 0} geänderte Einträge · ${holidaySyncStatus.successfulCountryCount ?? 1} Länder aktualisiert.` : '30 Länder werden monatlich über Nager.Date gepflegt.'}</p></div><div className="admin-panel__actions"><button className="button" type="button" onClick={refreshHolidays} disabled={holidaySyncing}>{holidaySyncing ? 'Feiertage werden aktualisiert …' : 'Feiertage jetzt aktualisieren'}</button></div></div></section><HolidaySyncLog entries={holidaySyncLogs} /><section className="admin-panel admin-holiday-sync"><div className="admin-panel__heading"><div><h2>Schulferien</h2><p>{schoolHolidaySyncDate ? `Zuletzt aktualisiert: ${syncDateFormatter.format(schoolHolidaySyncDate)} · ${schoolHolidaySyncStatus.source || 'OpenHolidays'} · ${schoolHolidaySyncStatus.updatedEntryCount || 0} geänderte Einträge · ${schoolHolidaySyncStatus.successfulSubdivisionCount ?? 0} Bundesländer aktualisiert.` : 'Alle 16 Bundesländer werden monatlich über OpenHolidays gepflegt.'}</p></div><div className="admin-panel__actions"><button className="button" type="button" onClick={refreshSchoolHolidays} disabled={schoolHolidaySyncing}>{schoolHolidaySyncing ? 'Ferien werden aktualisiert …' : 'Ferien jetzt aktualisieren'}</button></div></div></section><SchoolHolidaySyncLog entries={schoolHolidaySyncLogs} /></>}{isActiveSuperadmin && <><LegacyAccountReviewPanel /><section className="admin-panel admin-manual-triggers"><div className="admin-panel__heading"><div><h2>Manuell auslösen</h2></div></div><div className="admin-manual-triggers__actions"><button className="button" type="button" onClick={() => setResearchConfirmationOpen(true)} disabled={researching}>{researching ? 'Recherche läuft …' : 'News-Recherche starten'}</button></div></section><section className="admin-panel admin-system-mails-card"><div className="admin-panel__heading"><div><h2>Systemmails</h2><p>Vorlagen und Testversand für automatische Systemmails verwalten.</p></div><div className="admin-panel__actions"><Link className="button button--secondary" to="/admin/systemmails">Systemmails verwalten</Link></div></div></section><section className="admin-panel admin-system-mails-card"><div className="admin-panel__heading"><div><h2>KI-Prompts</h2><p>Ergänzende Fachanweisungen für KI-Funktionen verwalten.</p></div><div className="admin-panel__actions"><Link className="button button--secondary" to="/admin/ki-prompts">KI-Prompts verwalten</Link></div></div></section></>}{canManagePermissions && <><PartnerEvaluationSettingsPanel /><DepartmentManagementPanel departments={orderedDepartments} error={departmentError} saving={departmentSaving} onCreate={(name) => saveDepartment(() => createDepartment(name))} onUpdate={(id, values) => saveDepartment(() => updateDepartment(id, values))} /><CalendarManagementPanel calendars={calendars} users={users} permissionsByCalendar={calendarPermissions} error={calendarError} saving={calendarSaving} onCreate={(values) => saveCalendar(() => createCalendar(values), 'Kalender angelegt.')} onUpdate={(id, values) => saveCalendar(() => updateCalendar(id, values), values.active === false ? 'Kalender archiviert.' : values.active === true ? 'Kalender reaktiviert.' : 'Kalender aktualisiert.')} onSavePermissions={(calendarId, permissions) => saveCalendar(() => saveCalendarPermissions(calendarId, permissions), 'Kalenderberechtigungen aktualisiert.')} /></>}</>}</div>
}
