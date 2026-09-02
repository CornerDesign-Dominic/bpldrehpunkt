import { useEffect, useState } from 'react'
import AdminEmployeesTable from '../components/admin/AdminEmployeesTable.jsx'
import UserManagementForm from '../components/admin/UserManagementForm.jsx'
import Toast from '../components/ui/Toast.jsx'
import { usePermissions } from '../auth/usePermissions.js'
import { getSafeProfileDefaults } from '../lib/permissions.js'
import { createManagedUser, updateManagedUser } from '../lib/userManagement.js'
import { listUserProfiles } from '../lib/userProfiles.js'
import '../styles/admin.css'

const emptyUser = () => ({ firstName: '', lastName: '', email: '', department: '', jobTitle: '', phone: '', personnelNumber: '', employmentStart: '', active: true, role: 'user', permissions: {} })

export default function AdminPage() {
  const { canManagePermissions } = usePermissions()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [isNew, setNew] = useState(false)
  const [saving, setSaving] = useState(false)
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

  return <div className="admin-page">{toast && <Toast message={toast} onDismiss={() => setToast('')} />}{editing ? <UserManagementForm value={editing} isNew={isNew} canManagePermissions={canManagePermissions} saving={saving} onChange={setEditing} onCancel={() => setEditing(null)} onSubmit={save} /> : <section className="admin-panel"><div className="admin-panel__heading"><div><h2>Mitarbeiter</h2><p>Benutzerkonten und Stammdaten.</p></div><button className="button" type="button" onClick={() => { setEditing(emptyUser()); setNew(true) }}>Mitarbeiter anlegen</button></div>{error && <p className="form-error">{error}</p>}<AdminEmployeesTable users={users} loading={loading} error={error} onManage={(user) => { setEditing(getSafeProfileDefaults(user)); setNew(false) }} /></section>}</div>
}
