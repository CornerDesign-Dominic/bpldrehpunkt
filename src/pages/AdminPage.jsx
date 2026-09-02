import { useEffect, useMemo, useState } from 'react'
import AdminEmployeesTable from '../components/admin/AdminEmployeesTable.jsx'
import UserManagementForm from '../components/admin/UserManagementForm.jsx'
import Toast from '../components/ui/Toast.jsx'
import { useAuth } from '../auth/useAuth.js'
import { usePermissions } from '../auth/usePermissions.js'
import { getSafeProfileDefaults } from '../lib/permissions.js'
import { createManagedUser, updateManagedUser } from '../lib/userManagement.js'
import { listUserProfiles } from '../lib/userProfiles.js'
import '../styles/admin.css'

const emptyUser = () => ({ firstName: '', lastName: '', email: '', department: '', jobTitle: '', phone: '', personnelNumber: '', employmentStart: '', active: true, role: 'user', permissions: {}, vacationManager: false, vacationManagerAllDepartments: false, vacationManagerDepartments: [] })

export default function AdminPage() {
  const { user, profile } = useAuth()
  const { canManagePermissions } = usePermissions()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [isNew, setNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testingNotification, setTestingNotification] = useState(false)
  const [toast, setToast] = useState('')

  async function reload() {
    setLoading(true)
    try { setUsers(await listUserProfiles()) } catch { setError('Mitarbeiterdaten konnten nicht geladen werden.') } finally { setLoading(false) }
  }

  useEffect(() => {
    let active = true
    listUserProfiles()
      .then((profiles) => { if (active) setUsers(profiles) })
      .catch(() => { if (active) setError('Mitarbeiterdaten konnten nicht geladen werden.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

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

  const departments = useMemo(() => [...new Set(users.map((item) => item.department?.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right, 'de')), [users])

  return <div className="admin-page">{toast && <Toast message={toast} onDismiss={() => setToast('')} />}{editing ? <UserManagementForm value={editing} isNew={isNew} canManagePermissions={canManagePermissions} departments={departments} saving={saving} onChange={setEditing} onCancel={() => setEditing(null)} onSubmit={save} /> : <section className="admin-panel"><div className="admin-panel__heading"><div><h2>Mitarbeiter</h2><p>Benutzerkonten und Stammdaten.</p></div><div className="admin-panel__actions"><button className="button button--secondary" type="button" onClick={testPowerAutomate} disabled={testingNotification}>{testingNotification ? 'Wird getestet …' : 'Power Automate testen'}</button><button className="button" type="button" onClick={() => { setEditing(emptyUser()); setNew(true) }}>Mitarbeiter anlegen</button></div></div>{error && <p className="form-error">{error}</p>}<AdminEmployeesTable users={users} loading={loading} error={error} onManage={(user) => { setEditing(getSafeProfileDefaults(user)); setNew(false) }} /></section>}</div>
}
