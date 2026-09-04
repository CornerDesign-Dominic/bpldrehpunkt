import { useEffect, useMemo, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
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
import { listUserProfiles } from '../lib/userProfiles.js'
import { createCalendar, listCalendarPermissions, listCalendars, setCalendarPermissions as saveCalendarPermissions, updateCalendar } from '../lib/calendars.js'
import { functions } from '../lib/firebase.js'
import '../styles/admin.css'

const emptyUser = () => ({ firstName: '', lastName: '', email: '', departmentId: '', department: '', jobTitle: '', phone: '', personnelNumber: '', employmentStart: '', active: true, role: 'user', permissions: {}, vacationManager: false, vacationManagerAllDepartments: false, vacationManagerDepartments: [] })

export default function AdminPage() {
  const { user, profile } = useAuth()
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
  const [testingNotification, setTestingNotification] = useState(false)
  const [researching, setResearching] = useState(false)
  const [researchConfirmationOpen, setResearchConfirmationOpen] = useState(false)
  const [toast, setToast] = useState('')

  async function reload() {
    setLoading(true)
    setError('')
    try { setUsers(await listUserProfiles()) } catch { setError('Mitarbeiterdaten konnten nicht geladen werden.') } finally { setLoading(false) }
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
    listUserProfiles()
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

  async function testPowerAutomate() {
    const testRecipient = typeof user?.email === 'string' && user.email.trim()
      ? user.email.trim()
      : (typeof profile?.email === 'string' ? profile.email.trim() : '')
    if (!testRecipient) {
      setToast('Die E-Mail-Adresse des angemeldeten Administrators ist nicht verfügbar.')
      return
    }
    setTestingNotification(true)
    try {
      const response = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testRecipient, subject: 'Drehpunkt Testmail', message: 'Die generische Drehpunkt-Mail-Schnittstelle funktioniert.', type: 'system_test' }),
      })
      if (!response.ok) throw new Error('request-failed')
      setToast('Power Automate wurde erfolgreich ausgelöst.')
    } catch {
      setToast('Power Automate konnte nicht ausgelöst werden.')
    } finally {
      setTestingNotification(false)
    }
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

  return <div className="admin-page"><ConfirmDialog open={researchConfirmationOpen} title="News-Recherche starten?" message="Die Recherche führt eine kostenpflichtige KI- und Websuche aus. Möchten Sie sie jetzt wirklich starten?" confirmLabel="Recherche starten" submittingLabel="Recherche läuft …" isSubmitting={researching} onCancel={() => setResearchConfirmationOpen(false)} onConfirm={runNewsResearch} />{toast && <Toast message={toast} onDismiss={() => setToast('')} />}{editing ? <UserManagementForm value={editing} isNew={isNew} canManagePermissions={canManagePermissions} departments={orderedDepartments} saving={saving} onChange={setEditing} onCancel={() => setEditing(null)} onSubmit={save} /> : <><section className="admin-panel"><div className="admin-panel__heading"><div><h2>Mitarbeiter</h2><p>Benutzerkonten und Stammdaten.</p></div><div className="admin-panel__actions"><button className="button" type="button" onClick={() => { setEditing(emptyUser()); setNew(true) }}>Mitarbeiter anlegen</button></div></div>{error && <p className="form-error">{error}</p>}<AdminEmployeesTable users={users} loading={loading} error={error} onManage={(user) => { setEditing(getSafeProfileDefaults(user)); setNew(false) }} /></section><section className="admin-panel admin-manual-triggers"><div className="admin-panel__heading"><div><h2>Manuell auslösen</h2></div></div><div className="admin-manual-triggers__actions"><button className="button button--secondary" type="button" onClick={testPowerAutomate} disabled={testingNotification}>{testingNotification ? 'Wird getestet …' : 'Power Automate testen'}</button>{profile?.role === 'superadmin' && <button className="button" type="button" onClick={() => setResearchConfirmationOpen(true)} disabled={researching}>{researching ? 'Recherche läuft …' : 'News-Recherche starten'}</button>}</div></section>{canManagePermissions && <><DepartmentManagementPanel departments={orderedDepartments} error={departmentError} saving={departmentSaving} onCreate={(name) => saveDepartment(() => createDepartment(name))} onUpdate={(id, values) => saveDepartment(() => updateDepartment(id, values))} /><CalendarManagementPanel calendars={calendars} users={users} permissionsByCalendar={calendarPermissions} error={calendarError} saving={calendarSaving} onCreate={(values) => saveCalendar(() => createCalendar(values), 'Kalender angelegt.')} onUpdate={(id, values) => saveCalendar(() => updateCalendar(id, values), values.active === false ? 'Kalender archiviert.' : values.active === true ? 'Kalender reaktiviert.' : 'Kalender aktualisiert.')} onSavePermissions={(calendarId, permissions) => saveCalendar(() => saveCalendarPermissions(calendarId, permissions), 'Kalenderberechtigungen aktualisiert.')} /></>}</>}</div>
}
