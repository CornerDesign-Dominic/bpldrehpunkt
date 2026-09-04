import { useState } from 'react'
import { MODULES, PERMISSION_LEVELS, ROLE_LABELS, USER_ROLES, normalizePermissions } from '../../lib/permissions.js'

const personalFields = [
  ['firstName', 'Vorname'], ['lastName', 'Nachname'], ['jobTitle', 'Funktion'],
  ['phone', 'Telefon / Durchwahl'], ['personnelNumber', 'Personalnummer'], ['employmentStart', 'Eintrittsdatum'],
]

const permissionLabels = { none: 'Kein Zugriff', view: 'Ansehen', edit: 'Bearbeiten' }

function TextField({ field, label, value, onChange }) {
  return <label className="form-field"><span>{label}</span><input type={field === 'employmentStart' ? 'date' : 'text'} required={['firstName', 'lastName'].includes(field)} value={value ?? ''} onChange={(event) => onChange(field, event.target.value)} /></label>
}

export default function UserManagementForm({ value, isNew, canManagePermissions, departments, saving, onChange, onCancel, onSubmit }) {
  const [showPasswordReset, setShowPasswordReset] = useState(false)
  const [errors, setErrors] = useState({})
  const permissions = normalizePermissions(value.permissions)
  const selectableManagerDepartments = departments.filter((department) => department.active || (value.vacationManagerDepartments || []).includes(department.id))
  const selectableManagerIds = selectableManagerDepartments.filter((department) => department.active).map((department) => department.id)
  const selectedManagerDepartments = value.vacationManagerDepartments || []
  const allManagerDepartmentsSelected = value.vacationManagerAllDepartments === true || (selectableManagerIds.length > 0 && selectableManagerIds.every((id) => selectedManagerDepartments.includes(id)))
  const set = (field, next) => {
    onChange({ ...value, [field]: next })
    if (errors[field]) setErrors({ ...errors, [field]: '' })
  }
  const setPermission = (module, next) => set('permissions', { ...permissions, [module]: next })
  const setAllManagerDepartments = (checked) => onChange({ ...value, vacationManagerAllDepartments: checked, vacationManagerDepartments: checked ? selectableManagerIds : [] })
  const toggleManagerDepartment = (departmentId, checked) => {
    const next = new Set(allManagerDepartmentsSelected ? selectableManagerIds : selectedManagerDepartments)
    if (checked) next.add(departmentId)
    else next.delete(departmentId)
    const nextIds = [...next]
    onChange({ ...value, vacationManagerAllDepartments: selectableManagerIds.length > 0 && selectableManagerIds.every((id) => next.has(id)), vacationManagerDepartments: nextIds })
  }
  const title = isNew ? 'Mitarbeiter anlegen' : `${[value.firstName, value.lastName].filter(Boolean).join(' ') || 'Mitarbeiter'} bearbeiten`
  const passwordIsValid = (password) => typeof password === 'string' && password.length >= 6 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password)

  function validateAndSubmit(event) {
    event.preventDefault()
    const nextErrors = {}
    const email = value.email?.trim()

    if (!email) nextErrors.email = 'Bitte eine E-Mail-Adresse eingeben.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) nextErrors.email = 'Bitte eine gültige E-Mail-Adresse eingeben.'

    if ((isNew || showPasswordReset) && !passwordIsValid(value.password)) {
      nextErrors.password = 'Mindestens 6 Zeichen, ein Großbuchstabe, ein Kleinbuchstabe und eine Zahl sind erforderlich.'
    }

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    onSubmit(event)
  }

  return <section className="admin-user-form"><div className="admin-user-form__heading"><div><h2>{title}</h2><p>{isNew ? 'Neue Konten werden standardmäßig als User angelegt.' : 'Kontodaten, Stammdaten und Zugriffe verwalten.'}</p></div><button type="button" className="button button--secondary" onClick={onCancel}>Schließen</button></div><form onSubmit={validateAndSubmit} noValidate>
    <section className="admin-user-form__section" aria-labelledby="account-heading"><h3 id="account-heading">Kontozugang</h3><div className="admin-user-form__grid admin-user-form__grid--account"><label className="form-field"><span>E-Mail *</span><input type="email" required value={value.email ?? ''} onChange={(event) => set('email', event.target.value)} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'managed-user-email-error' : undefined} />{errors.email && <small id="managed-user-email-error" className="field-error">{errors.email}</small>}</label>{isNew ? <label className="form-field"><span>Initiales Passwort *</span><input type="password" minLength="6" required value={value.password ?? ''} onChange={(event) => set('password', event.target.value)} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'managed-user-password-error' : undefined} autoComplete="new-password" />{errors.password && <small id="managed-user-password-error" className="field-error">{errors.password}</small>}</label> : <div className="admin-password-reset">{showPasswordReset ? <label className="form-field"><span>Neues Passwort</span><input type="password" minLength="6" required value={value.password ?? ''} onChange={(event) => set('password', event.target.value)} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'managed-user-password-error' : undefined} autoComplete="new-password" />{errors.password && <small id="managed-user-password-error" className="field-error">{errors.password}</small>}</label> : <button className="button button--secondary" type="button" onClick={() => setShowPasswordReset(true)}>Passwort zurücksetzen</button>}{showPasswordReset && <button className="admin-password-reset__cancel" type="button" onClick={() => { set('password', ''); setShowPasswordReset(false) }}>Abbrechen</button>}</div>}<label className="form-field"><span>Status</span><select value={value.active === false ? 'inactive' : 'active'} onChange={(event) => set('active', event.target.value === 'active')}><option value="active">Aktiv</option><option value="inactive">Deaktiviert</option></select></label><label className="form-field"><span>Rolle</span>{canManagePermissions ? <select value={value.role ?? 'user'} onChange={(event) => set('role', event.target.value)}>{USER_ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select> : <input value={ROLE_LABELS[value.role] || 'User'} readOnly />}</label></div></section>
    <section className="admin-user-form__section" aria-labelledby="details-heading"><h3 id="details-heading">Person &amp; Beschäftigung</h3><div className="admin-user-form__grid admin-user-form__grid--details">{personalFields.map(([field, label]) => <TextField key={field} field={field} label={label} value={value[field]} onChange={set} />)}<label className="form-field"><span>Abteilung</span><select value={value.departmentId || ''} onChange={(event) => set('departmentId', event.target.value)}><option value="">Nicht zugeordnet</option>{departments.map((department) => <option key={department.id} value={department.id} disabled={!department.active && department.id !== value.departmentId}>{department.name}{department.active ? '' : ' (inaktiv)'}</option>)}</select></label></div></section>
    {canManagePermissions && <section className="admin-user-form__section" aria-labelledby="vacation-manager-heading"><div className="admin-user-form__section-heading"><div><h3 id="vacation-manager-heading">Urlaubsmanagement</h3><p>Zuständigkeit für Genehmigung und Ablehnung von Urlaubsanträgen.</p></div></div><label className="admin-checkbox"><input type="checkbox" checked={value.vacationManager === true} onChange={(event) => onChange({ ...value, vacationManager: event.target.checked, vacationManagerAllDepartments: event.target.checked ? value.vacationManagerAllDepartments === true : false, vacationManagerDepartments: event.target.checked ? value.vacationManagerDepartments || [] : [] })} />Urlaubsmanager</label>{value.vacationManager === true && <div className="admin-vacation-manager"><label className="admin-checkbox"><input type="checkbox" checked={allManagerDepartmentsSelected} onChange={(event) => setAllManagerDepartments(event.target.checked)} />Alle Abteilungen</label><div className="admin-vacation-manager__list" aria-label="Zuständige Abteilungen">{selectableManagerDepartments.map((department) => { const checked = allManagerDepartmentsSelected || selectedManagerDepartments.includes(department.id); return <label className={department.active ? 'admin-checkbox' : 'admin-checkbox admin-checkbox--inactive'} key={department.id}><input type="checkbox" checked={checked} disabled={!department.active} onChange={(event) => toggleManagerDepartment(department.id, event.target.checked)} />{department.name}{department.active ? '' : ' (inaktiv)'}</label> })}</div>{selectableManagerDepartments.length === 0 && <p className="admin-vacation-manager__empty">Keine aktiven Abteilungen vorhanden.</p>}</div>}</section>}
    {canManagePermissions && <section className="admin-user-form__section admin-user-form__section--permissions" aria-labelledby="permissions-heading"><div className="admin-user-form__section-heading"><div><h3 id="permissions-heading">Berechtigungen</h3><p>Änderungen gelten pro Modul.</p></div></div><div className="admin-permissions__list">{Object.entries(MODULES).map(([module, { label }]) => <div className="admin-permission-row" key={module}><span>{label}</span><div className="admin-permission-control" role="group" aria-label={`${label} Berechtigung`}>{PERMISSION_LEVELS.map((level) => <button key={level} type="button" className={permissions[module] === level ? 'admin-permission-control__option admin-permission-control__option--active' : 'admin-permission-control__option'} aria-pressed={permissions[module] === level} onClick={() => setPermission(module, level)}>{permissionLabels[level]}</button>)}</div></div>)}</div></section>}
    <div className="admin-user-form__actions"><button className="button button--secondary" type="button" onClick={onCancel} disabled={saving}>Abbrechen</button><button className="button" type="submit" disabled={saving}>{saving ? 'Wird gespeichert …' : isNew ? 'Mitarbeiter anlegen' : 'Änderungen speichern'}</button></div>
  </form></section>
}
