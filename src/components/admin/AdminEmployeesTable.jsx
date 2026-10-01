import { StaticText, TranslatedProps } from '../../i18n/AutoTranslate.jsx'
import { EditIcon } from '../icons.jsx'
import { useAuth } from '../../auth/useAuth.js'
import TomTomUsagePanel from './TomTomUsagePanel.jsx'

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
  const { profile } = useAuth()
  const sortedUsers = [...users].sort((left, right) => displayName(left).localeCompare(displayName(right), 'de'))
  const isActiveAdmin = ['admin', 'superadmin'].includes(profile?.role) && profile?.active === true
  return <><div className="admin-employees table-frame"><table className="data-table"><thead><tr><th>Name</th><th><StaticText source={"Rolle"} /></th><th><StaticText source={"Abteilung"} /></th><th><StaticText source={"E-Mail"} /></th><th><StaticText source={"Telefon"} /></th><th>Status</th><th><StaticText source={"Aktionen"} /></th></tr></thead><tbody>{loading ? <tr><td colSpan="7" className="table-state"><StaticText source={"Mitarbeiter werden geladen …"} /></td></tr> : error ? <tr><td colSpan="7" className="table-state"><StaticText source={"Mitarbeiter können derzeit nicht angezeigt werden."} /></td></tr> : sortedUsers.length ? sortedUsers.map((user) => <tr key={user.id}><td><strong>{displayName(user)}</strong></td><td>{roleLabel(user.role)}</td><td>{user.departmentName || user.department || <StaticText source={"Keine Abteilung"} />}</td><td>{user.email || '—'}</td><td>{user.phone || '—'}</td><td><span className={user.active === false ? 'admin-employees__status admin-employees__status--inactive' : 'admin-employees__status'}>{<StaticText source={user.active === false ? 'Deaktiviert' : 'Aktiv'} />}</span></td><td className="admin-employees__action"><TranslatedProps sources={{"title":"Mitarbeiter bearbeiten"}}><button type="button" onClick={() => onManage(user)} title="Mitarbeiter bearbeiten" aria-label={`${displayName(user)} bearbeiten`}><EditIcon size={16} /></button></TranslatedProps></td></tr>) : <tr><td colSpan="7" className="table-state"><StaticText source={"Noch keine Mitarbeiterdaten vorhanden."} /></td></tr>}</tbody></table></div>{isActiveAdmin && <TomTomUsagePanel />}</>
}
