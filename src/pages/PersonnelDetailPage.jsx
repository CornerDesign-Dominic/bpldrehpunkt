import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { usePermissions } from '../auth/usePermissions.js'
import { EditIcon } from '../components/icons.jsx'
import { PersonnelVacationMetaModal, PersonnelVacationTable } from '../components/personnel/PersonnelVacationTable.jsx'
import Toast from '../components/ui/Toast.jsx'
import { getPersonnelEmployee, listPersonnelVacations, updatePersonnelEmployee, updatePersonnelVacationMeta } from '../lib/personnel.js'
import { listDepartments } from '../lib/departments.js'
import '../styles/personnel.css'

const masterDataFields = [
  ['firstName', 'Vorname', 'text'], ['lastName', 'Nachname', 'text'], ['jobTitle', 'Funktion', 'text'], ['phone', 'Telefonnummer', 'text'],
]
const employmentFields = [
  ['personnelNumber', 'Personalnummer', 'text'], ['employmentStart', 'Eintrittsdatum', 'date'], ['employmentEnd', 'Austrittsdatum', 'date'],
]
const vacationFields = [
  ['annualVacationEntitlement', 'Anspruch Urlaubstage pro Jahr', 'number'], ['vacationTrackingStartYear', 'Startjahr Urlaubserfassung', 'select'], ['vacationTrackingOpeningBalance', 'Anzahl Urlaubstage im Startjahr', 'number'],
]
const hrFields = [
  ['birthDate', 'Geburtsdatum', 'date'], ['streetAddress', 'Straße / Hausnummer', 'text'], ['postalCode', 'PLZ', 'text'], ['city', 'Ort', 'text'], ['country', 'Land', 'text'],
]

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('de-DE').format(date)
}

function displayValue(field, value) {
  return ['birthDate', 'employmentStart', 'employmentEnd'].includes(field) ? formatDate(value) : (value === 0 ? '0' : value || '—')
}

function ReadOnlyFields({ fields, employee }) {
  return <dl className="personnel-detail__read-only">{fields.map(([field, label]) => <div key={field}><dt>{label}</dt><dd>{displayValue(field, employee[field])}</dd></div>)}</dl>
}

function PersonnelCard({ children, editing, isAnotherCardEditing, onEdit, title }) {
  return <section className="personnel-detail__card"><div className="personnel-detail__card-heading"><h2>{title}</h2>{onEdit && !editing && <button className="personnel-detail__card-edit" type="button" onClick={onEdit} disabled={isAnotherCardEditing} title={`${title} bearbeiten`} aria-label={`${title} bearbeiten`}><EditIcon size={16} /></button>}</div>{children}</section>
}

function EditActions({ saving, onCancel }) {
  return <div className="personnel-detail__actions"><button className="button button--secondary" type="button" onClick={onCancel} disabled={saving}>Abbrechen</button><button className="button" type="submit" disabled={saving}>{saving ? 'Wird gespeichert …' : 'Änderungen speichern'}</button></div>
}

function overlapsYear(vacation, year) {
  return vacation.startDate <= `${year}-12-31` && vacation.endDate >= `${year}-01-01`
}

function VacationYearSummary({ vacations }) {
  const sum = (status) => vacations.filter((vacation) => vacation.status === status).reduce((total, vacation) => total + (Number(vacation.days) || 0), 0)
  const cancelled = vacations.filter((vacation) => ['cancelled', 'withdrawn'].includes(vacation.status)).reduce((total, vacation) => total + (Number(vacation.days) || 0), 0)
  return <dl className="personnel-vacation-summary"><div><dt>Genehmigte Urlaubstage</dt><dd>{sum('approved')}</dd></div><div><dt>Aktuell angefragte Urlaubstage</dt><dd>{sum('pending')}</dd></div><div><dt>Abgelehnte Urlaubstage</dt><dd>{sum('rejected')}</dd></div><div><dt>Stornierte / zurückgezogene Tage</dt><dd>{cancelled}</dd></div></dl>
}

export default function PersonnelDetailPage() {
  const { userId } = useParams()
  const { canEdit } = usePermissions()
  const canModify = canEdit('personnel')
  const [employee, setEmployee] = useState(null)
  const [savedEmployee, setSavedEmployee] = useState(null)
  const [editingSection, setEditingSection] = useState(null)
  const [departments, setDepartments] = useState([])
  const [vacations, setVacations] = useState([])
  const [vacationYear, setVacationYear] = useState(new Date().getFullYear())
  const [vacationDisplay, setVacationDisplay] = useState('all')
  const [selectedVacation, setSelectedVacation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [vacationSaving, setVacationSaving] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  useEffect(() => {
    let current = true
    Promise.all([getPersonnelEmployee(userId), listDepartments(), listPersonnelVacations(userId)])
      .then(([item, availableDepartments, employeeVacations]) => {
        if (!current) return
        setEmployee(item)
        setSavedEmployee(item)
        setDepartments(availableDepartments)
        setVacations(employeeVacations)
      })
      .catch(() => { if (current) setError('Mitarbeiterdaten konnten nicht geladen werden.') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [userId])

  function set(field, value) {
    setEmployee((current) => ({ ...current, [field]: value }))
  }

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await updatePersonnelEmployee(userId, employee)
      const refreshed = await getPersonnelEmployee(userId)
      setEmployee(refreshed)
      setSavedEmployee(refreshed)
      setEditingSection(null)
      setToast('Personaldaten wurden aktualisiert.')
    } catch (saveError) {
      setError(saveError?.message?.replace(/^.*?:\s*/, '') || 'Personaldaten konnten nicht gespeichert werden.')
    } finally {
      setSaving(false)
    }
  }

  function cancelEditing() {
    setEmployee(savedEmployee)
    setError('')
    setEditingSection(null)
  }

  async function saveVacationMeta(values) {
    if (!selectedVacation) return
    setVacationSaving(true)
    setError('')
    try {
      await updatePersonnelVacationMeta(selectedVacation.vacationId, values)
      setVacations(await listPersonnelVacations(userId))
      setSelectedVacation(null)
      setToast('HR-Informationen wurden aktualisiert.')
    } catch (saveError) {
      setError(saveError?.message?.replace(/^.*?:\s*/, '') || 'HR-Informationen konnten nicht gespeichert werden.')
    } finally {
      setVacationSaving(false)
    }
  }

  if (loading) return <p className="personnel-state">Mitarbeiterdaten werden geladen …</p>
  if (error && !employee) return <section className="page-state page-state--error"><h2>Mitarbeiter nicht verfügbar</h2><p>{error}</p></section>

  const availableDepartments = departments.filter((department) => department.active || department.id === employee.departmentId)
  const vacationTrackingYears = Array.from({ length: new Date().getFullYear() - 1898 }, (_, index) => new Date().getFullYear() + 1 - index)
  const vacationYears = [...new Set([new Date().getFullYear(), vacationYear, ...vacations.flatMap((vacation) => [Number(vacation.startDate?.slice(0, 4)), Number(vacation.endDate?.slice(0, 4))]).filter(Number.isFinite)])].sort((left, right) => right - left)
  const yearVacations = vacations.filter((vacation) => overlapsYear(vacation, vacationYear)).sort((left, right) => left.startDate.localeCompare(right.startDate))
  const displayedVacations = vacationDisplay === 'relevant' ? yearVacations.filter((vacation) => vacation.status === 'approved' && vacation.payrollProcessed === true) : yearVacations
  const isAnotherCardEditing = Boolean(editingSection)
  const isEditingMasterData = editingSection === 'master-data'
  const isEditingEmployment = editingSection === 'employment'
  const isEditingPersonalData = editingSection === 'personal-data'
  const isEditingVacationData = editingSection === 'vacation-data'

  return <div className="personnel-detail-page">{toast && <Toast message={toast} onDismiss={() => setToast('')} />}<div className="personnel-detail__heading"><Link className="button button--secondary" to="/personal">Zurück</Link></div>{error && <p className="form-error">{error}</p>}
    <div className="personnel-detail__cards">
      <form onSubmit={save}><PersonnelCard title="Stammdaten" editing={isEditingMasterData} isAnotherCardEditing={isAnotherCardEditing} onEdit={canModify ? () => setEditingSection('master-data') : null}>{isEditingMasterData ? <><div className="personnel-detail__grid">{masterDataFields.map(([field, label, type]) => <label className="form-field" key={field}><span>{label}</span><input type={type} required={field === 'firstName' || field === 'lastName'} value={employee[field] ?? ''} onChange={(event) => set(field, event.target.value)} /></label>)}<label className="form-field"><span>Abteilung</span><select value={employee.departmentId || ''} onChange={(event) => set('departmentId', event.target.value)}><option value="">Nicht zugeordnet</option>{availableDepartments.map((department) => <option key={department.id} value={department.id}>{department.name}{department.active ? '' : ' (inaktiv)'}</option>)}</select></label></div><EditActions saving={saving} onCancel={cancelEditing} /></> : <ReadOnlyFields fields={[...masterDataFields, ['department', 'Abteilung']]} employee={employee} />}</PersonnelCard></form>
      <form onSubmit={save}><PersonnelCard title="Arbeitsverhältnis" editing={isEditingEmployment} isAnotherCardEditing={isAnotherCardEditing} onEdit={canModify ? () => setEditingSection('employment') : null}>{isEditingEmployment ? <><div className="personnel-detail__grid">{employmentFields.map(([field, label, type]) => <label className="form-field" key={field}><span>{label}</span><input type={type} value={employee[field] ?? ''} onChange={(event) => set(field, event.target.value)} /></label>)}</div><EditActions saving={saving} onCancel={cancelEditing} /></> : <ReadOnlyFields fields={employmentFields} employee={employee} />}</PersonnelCard></form>
      <form onSubmit={save}><PersonnelCard title="Persönliche Angaben" editing={isEditingPersonalData} isAnotherCardEditing={isAnotherCardEditing} onEdit={canModify ? () => setEditingSection('personal-data') : null}>{isEditingPersonalData ? <><div className="personnel-detail__grid">{hrFields.map(([field, label, type]) => <label className="form-field" key={field}><span>{label}</span><input type={type} value={employee[field] ?? ''} onChange={(event) => set(field, event.target.value)} /></label>)}<label className="form-field"><span>Steuerklasse</span><select value={employee.taxClass ?? ''} onChange={(event) => set('taxClass', event.target.value)}><option value="">Nicht angegeben</option>{['1', '2', '3', '4', '5', '6'].map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="form-field"><span>Anzahl Kinder</span><input type="number" min="0" max="50" step="1" value={employee.childrenCount ?? ''} onChange={(event) => set('childrenCount', event.target.value)} /></label></div><EditActions saving={saving} onCancel={cancelEditing} /></> : <ReadOnlyFields fields={[...hrFields, ['taxClass', 'Steuerklasse'], ['childrenCount', 'Anzahl Kinder']]} employee={employee} />}</PersonnelCard></form>
    </div>
    <form onSubmit={save}><PersonnelCard title="Urlaubsdaten" editing={isEditingVacationData} isAnotherCardEditing={isAnotherCardEditing} onEdit={canModify ? () => setEditingSection('vacation-data') : null}>{isEditingVacationData ? <><div className="personnel-detail__grid">{vacationFields.map(([field, label, type]) => <label className="form-field" key={field}><span>{label}</span>{type === 'select' ? <select value={employee[field] ?? ''} onChange={(event) => set(field, event.target.value)}><option value="">Nicht angegeben</option>{vacationTrackingYears.map((year) => <option key={year} value={year}>{year}</option>)}</select> : <input type={type} min={field === 'annualVacationEntitlement' ? '0' : '-366'} max="366" step="0.5" value={employee[field] ?? ''} onChange={(event) => set(field, event.target.value)} />}</label>)}</div><EditActions saving={saving} onCancel={cancelEditing} /></> : <ReadOnlyFields fields={vacationFields} employee={employee} />}</PersonnelCard></form>
    <section className="personnel-detail__form personnel-vacation-detail"><div className="personnel-vacation-detail__heading"><div><h2>Urlaub</h2><p>Jahresübersicht aus den bestehenden Urlaubsanträgen.</p></div><div className="personnel-vacation-detail__filters"><label className="filter-field"><span>Anzeige</span><select value={vacationDisplay} onChange={(event) => setVacationDisplay(event.target.value)}><option value="all">Alle anzeigen</option><option value="relevant">Relevante anzeigen</option></select></label><label className="filter-field"><span>Jahr</span><select value={vacationYear} onChange={(event) => setVacationYear(Number(event.target.value))}>{vacationYears.map((year) => <option key={year} value={year}>{year}</option>)}</select></label></div></div><VacationYearSummary vacations={yearVacations} /><PersonnelVacationTable vacations={displayedVacations} includeEmployee={false} editable={canModify} onEdit={setSelectedVacation} /></section>
    {selectedVacation && <PersonnelVacationMetaModal key={selectedVacation.vacationId} vacation={selectedVacation} saving={vacationSaving} onClose={() => setSelectedVacation(null)} onSave={saveVacationMeta} />}
  </div>
}
