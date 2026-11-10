export default function TimeManagerFields({ value, departments, onChange }) {
  const selected = value.timeManagerDepartments || []
  const all = value.timeManagerAllDepartments === true
  const available = departments.filter((department) => department.active || selected.includes(department.id))
  const toggleDepartment = (id, checked) => {
    const next = new Set(selected)
    if (checked) next.add(id)
    else next.delete(id)
    onChange({ ...value, timeManagerDepartments: [...next] })
  }
  return <section className="admin-user-form__section" aria-labelledby="time-manager-heading">
    <div className="admin-user-form__section-heading"><div><h3 id="time-manager-heading">Zeitmanagement</h3><p>Zuständigkeit für Zeitbuchungen und Korrekturen. Unabhängig vom Urlaubsmanagement; Arbeitszeitmodelle bleiben ausschließlich für Superadmins sichtbar.</p></div></div>
    <label className="admin-checkbox"><input type="checkbox" checked={value.timeManager === true} onChange={(event) => onChange({ ...value, timeManager: event.target.checked, timeManagerAllDepartments: event.target.checked && all, timeManagerDepartments: event.target.checked ? selected : [] })} />Zeitmanager</label>
    {value.timeManager === true && <div className="admin-vacation-manager">
      <label className="admin-checkbox"><input type="checkbox" checked={all} onChange={(event) => onChange({ ...value, timeManagerAllDepartments: event.target.checked, timeManagerDepartments: event.target.checked ? [] : selected })} />Alle Abteilungen (auch künftig angelegte)</label>
      {!all && <div className="admin-vacation-manager__list" aria-label="Zuständige Zeitmanagement-Abteilungen">{available.map((department) => <label className="admin-checkbox" key={department.id}><input type="checkbox" checked={selected.includes(department.id)} disabled={!department.active} onChange={(event) => toggleDepartment(department.id, event.target.checked)} />{department.name}{!department.active && ' (inaktiv)'}</label>)}</div>}
      {!all && available.length === 0 && <p>Keine Abteilungen vorhanden.</p>}
      {!all && selected.length === 0 && <p>Ohne Abteilungszuweisung besteht kein Zugriff auf fremde Zeitdaten.</p>}
    </div>}
  </section>
}
