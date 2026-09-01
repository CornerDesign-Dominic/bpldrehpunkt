import { useEffect, useState } from 'react'
import AdminEmployeesTable from '../components/admin/AdminEmployeesTable.jsx'
import AdminPlaceholderPanel from '../components/admin/AdminPlaceholderPanel.jsx'
import { listUserProfiles } from '../lib/userProfiles.js'
import '../styles/admin.css'

const tabs = [
  { id: 'employees', label: 'Mitarbeiter' },
  { id: 'roles', label: 'Rollen & Berechtigungen' },
  { id: 'settings', label: 'Einstellungen' },
]

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('employees')
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let current = true
    listUserProfiles()
      .then((profiles) => { if (current) setUsers(profiles) })
      .catch(() => { if (current) setError('Mitarbeiterdaten konnten nicht geladen werden.') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [])

  return <div className="admin-page"><div className="admin-tabs" role="tablist" aria-label="Adminbereich"><div>{tabs.map((tab) => <button key={tab.id} id={`admin-tab-${tab.id}`} className={activeTab === tab.id ? 'admin-tabs__tab admin-tabs__tab--active' : 'admin-tabs__tab'} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`admin-panel-${tab.id}`} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}</div></div>{activeTab === 'employees' && <section id="admin-panel-employees" role="tabpanel" aria-labelledby="admin-tab-employees" className="admin-panel"><div className="admin-panel__heading"><div><h2>Mitarbeiter</h2><p>Bestehende Benutzerprofile aus der internen Benutzerverwaltung.</p></div><button className="button" type="button" disabled title="Die Benutzeranlage wird später sicher ergänzt">Mitarbeiter anlegen</button></div>{error && <p className="form-error">{error}</p>}<AdminEmployeesTable users={users} loading={loading} error={error} /></section>}{activeTab === 'roles' && <div id="admin-panel-roles" role="tabpanel" aria-labelledby="admin-tab-roles"><AdminPlaceholderPanel title="Rollen & Berechtigungen" description="Struktur für die spätere, sichere Rechteverwaltung." items={['Rollen', 'Modulzugriffe', 'hidden / requestable / granted', 'Abteilungszuordnung']} /></div>}{activeTab === 'settings' && <div id="admin-panel-settings" role="tabpanel" aria-labelledby="admin-tab-settings"><AdminPlaceholderPanel title="Einstellungen" description="Platz für spätere systemweite Einstellungen." items={['Systemweite Vorgaben', 'Modulkonfiguration', 'Allgemeine Verwaltungsoptionen']} /></div>}</div>
}
