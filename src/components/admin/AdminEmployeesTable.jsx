function displayName(user) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
  return name || user.name || user.email || '—'
}

function formatDate(value) {
  if (!value) return '—'
  const date = value.toDate?.() ?? new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('de-DE').format(date)
}

function roleLabel(role) {
  if (role === 'superadmin') return 'Superadmin'
  if (role === 'admin') return 'Admin'
  return 'User'
}

export default function AdminEmployeesTable({ users, loading, error, onManage }) {
  const sortedUsers = [...users].sort((left, right) => displayName(left).localeCompare(displayName(right), 'de'))
  return <div className="admin-employees table-frame"><table><thead><tr><th>Name</th><th>E-Mail</th><th>Abteilung</th><th>Rolle</th><th>Eintrittsdatum</th><th>Aktion</th></tr></thead><tbody>{loading ? <tr><td colSpan="6" className="table-state">Mitarbeiter werden geladen …</td></tr> : error ? <tr><td colSpan="6" className="table-state">Mitarbeiter können derzeit nicht angezeigt werden.</td></tr> : sortedUsers.length ? sortedUsers.map((user) => <tr key={user.id}><td><strong>{displayName(user)}</strong></td><td>{user.email || '—'}</td><td>{user.departmentName || user.department || 'Keine Abteilung'}</td><td>{roleLabel(user.role)}</td><td>{formatDate(user.employmentStart)}</td><td className="admin-employees__action"><button type="button" onClick={() => onManage(user)}>Verwalten</button></td></tr>) : <tr><td colSpan="6" className="table-state">Noch keine Mitarbeiterdaten vorhanden.</td></tr>}</tbody></table></div>
}
