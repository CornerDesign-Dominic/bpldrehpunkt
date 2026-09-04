import { EditIcon } from '../icons.jsx'

function displayName(user) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
  return name || user.name || user.email || '—'
}

function roleLabel(role) {
  if (role === 'superadmin') return 'Superadmin'
  if (role === 'admin') return 'Admin'
  return 'User'
}

export default function AdminEmployeesTable({ users, loading, error, onManage }) {
  const sortedUsers = [...users].sort((left, right) => displayName(left).localeCompare(displayName(right), 'de'))
  return <div className="admin-employees table-frame"><table><thead><tr><th>Name</th><th>Rolle</th><th>Abteilung</th><th>E-Mail</th><th>Telefon</th><th>Status</th><th>Aktionen</th></tr></thead><tbody>{loading ? <tr><td colSpan="7" className="table-state">Mitarbeiter werden geladen …</td></tr> : error ? <tr><td colSpan="7" className="table-state">Mitarbeiter können derzeit nicht angezeigt werden.</td></tr> : sortedUsers.length ? sortedUsers.map((user) => <tr key={user.id}><td><strong>{displayName(user)}</strong></td><td>{roleLabel(user.role)}</td><td>{user.departmentName || user.department || 'Keine Abteilung'}</td><td>{user.email || '—'}</td><td>{user.phone || '—'}</td><td><span className={user.active === false ? 'admin-employees__status admin-employees__status--inactive' : 'admin-employees__status'}>{user.active === false ? 'Deaktiviert' : 'Aktiv'}</span></td><td className="admin-employees__action"><button type="button" onClick={() => onManage(user)} title="Mitarbeiter bearbeiten" aria-label={`${displayName(user)} bearbeiten`}><EditIcon size={16} /></button></td></tr>) : <tr><td colSpan="7" className="table-state">Noch keine Mitarbeiterdaten vorhanden.</td></tr>}</tbody></table></div>
}
