import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { InlineDamageField, InlineDamageTitle } from '../components/damages/InlineDamageField.jsx'
import Toast from '../components/ui/Toast.jsx'
import { useAuth } from '../auth/useAuth.js'
import { usePermissions } from '../auth/usePermissions.js'
import { usePageHeader } from '../lib/pageHeader.js'
import { addDamageCaseUpdate, DAMAGE_CASE_STATUSES, DAMAGE_CONTRACTOR_LIABILITY, DAMAGE_INSURANCE_RELEVANCE, DAMAGE_LEGAL_BASES, damageCaseStatusLabel, damageDuePresentation, getDamageCase, listDamageCaseUpdates, updateDamageCaseFields } from '../lib/damages.js'
import { getUserDisplayName, listVisibleUserDirectory } from '../lib/userProfiles.js'

function formatDate(value) { return value ? new Intl.DateTimeFormat('de-DE').format(new Date(`${value}T12:00:00`)) : '' }
function formatCurrency(value) { return value === null || value === undefined ? '' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value) }
function formatNumber(value, suffix = '') { return value === null || value === undefined ? '' : `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(value)}${suffix}` }
function labelFor(options, value) { return options.find((option) => option.value === value)?.label || '' }
function formatTimestamp(value) { const date = value?.toDate?.(); return date ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : '—' }

export default function DamageDetailPage() {
  const { damageCaseId } = useParams()
  const { user, profile } = useAuth()
  const { canEdit } = usePermissions()
  const { setTitle } = usePageHeader()
  const editable = canEdit('damages')
  const [damageCase, setDamageCase] = useState(null)
  const [users, setUsers] = useState([])
  const [updates, setUpdates] = useState([])
  const [loading, setLoading] = useState(true)
  const [updatesLoading, setUpdatesLoading] = useState(true)
  const [note, setNote] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  async function load() {
    const [entry, history, directory] = await Promise.all([getDamageCase(damageCaseId), listDamageCaseUpdates(damageCaseId), editable ? listVisibleUserDirectory() : Promise.resolve([])])
    setDamageCase(entry); setUpdates(history); setUsers(directory); setTitle(entry?.caseNumber || ''); setUpdatesLoading(false)
  }

  useEffect(() => {
    let current = true
    Promise.all([getDamageCase(damageCaseId), listDamageCaseUpdates(damageCaseId), editable ? listVisibleUserDirectory() : Promise.resolve([])])
      .then(([entry, history, directory]) => { if (current) { setDamageCase(entry); setUpdates(history); setUsers(directory); setTitle(entry?.caseNumber || ''); setUpdatesLoading(false) } })
      .catch((loadError) => { if (current) { setError(loadError.code === 'permission-denied' ? 'Kein Zugriff auf diesen Fall.' : 'Der Fall konnte nicht geladen werden.'); setUpdatesLoading(false) } })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false; setTitle('') }
  }, [damageCaseId, editable, setTitle])

  const usersById = useMemo(() => new Map(users.map((entry) => [entry.id, entry])), [users])
  const responsibleOptions = useMemo(() => [{ value: '', label: 'Nicht zugeordnet' }, ...users.filter((entry) => entry.active !== false).sort((left, right) => getUserDisplayName(left, left).localeCompare(getUserDisplayName(right, right), 'de')).map((entry) => ({ value: entry.id, label: getUserDisplayName(entry, entry) }))], [users])

  async function saveField(field, value) {
    setError('')
    try {
      await updateDamageCaseFields(damageCase, { [field]: value }, { user, profile }, usersById)
      await load()
      setToast('Änderung gespeichert.')
    } catch (saveError) {
      setError(saveError.message || 'Die Änderung konnte nicht gespeichert werden.')
      throw saveError
    }
  }

  async function saveNote(event) {
    event.preventDefault(); setError(''); setNoteSaving(true)
    try {
      await addDamageCaseUpdate(damageCase, note, { user, profile }, usersById)
      setNote(''); await load(); setToast('Update hinzugefügt.')
    } catch (noteError) { setError(noteError.message || 'Das Update konnte nicht gespeichert werden.') } finally { setNoteSaving(false) }
  }

  if (loading) return <p className="page-state">Fall wird geladen …</p>
  if (error && !damageCase) return <section className="damage-detail-empty"><h2>Fall nicht verfügbar</h2><p>{error}</p><Link className="button button--secondary" to="/schaeden">Zur Übersicht</Link></section>
  if (!damageCase) return null

  const due = damageDuePresentation(damageCase)
  const dueValue = damageCase.dueDate ? `${due.label} · ${formatDate(damageCase.dueDate)}` : ''
  return <div className="damage-detail-page">
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    <header className="damage-detail-header"><Link className="damage-detail-header__back" to="/schaeden">← Zur Schäden-Übersicht</Link><div className="damage-detail-header__case"><h2>{damageCase.caseNumber}</h2><span className={`todo-status damage-status damage-status--${damageCase.status}`}>{damageCaseStatusLabel(damageCase.status)}</span></div><InlineDamageTitle editable={editable} value={damageCase.title} onSave={saveField} /></header>
    {error && <p className="form-error">{error}</p>}
    <section className="damage-detail-section" aria-labelledby="damage-general-title"><h3 id="damage-general-title">Allgemeine Daten</h3><dl className="damage-inline-grid"><div className="damage-inline-grid__column"><InlineDamageField editable={editable} field="status" label="Status" options={DAMAGE_CASE_STATUSES} value={damageCase.status} displayValue={damageCaseStatusLabel(damageCase.status)} onSave={saveField} /><InlineDamageField editable={editable} field="damageDate" label="Schadendatum" type="date" value={damageCase.damageDate} displayValue={formatDate(damageCase.damageDate)} onSave={saveField} /><InlineDamageField editable={editable} field="claimant" label="Kunde / Anspruchsteller" value={damageCase.claimant} onSave={saveField} /><InlineDamageField editable={editable} field="responsibleUserId" label="Verantwortliche Person" options={responsibleOptions} value={damageCase.responsibleUserId} displayValue={damageCase.responsibleUserName} onSave={saveField} /><InlineDamageField editable={editable} field="dueDate" label="Nächste Frist" type="date" value={damageCase.dueDate} displayValue={dueValue} className={`damage-inline-field--due damage-inline-field--${due.kind}`} onSave={saveField} /><InlineDamageField editable={editable} field="damageAmount" label="Schadenhöhe" type="number" value={damageCase.damageAmount} displayValue={formatCurrency(damageCase.damageAmount)} onSave={saveField} /></div><div className="damage-inline-grid__column"><InlineDamageField editable={editable} field="damageType" label="Schadenart" value={damageCase.damageType} onSave={saveField} /><InlineDamageField editable={editable} field="transportReference" label="Auftrag-/Tourreferenz" value={damageCase.transportReference} onSave={saveField} /><InlineDamageField editable={editable} field="contractor" label="Unternehmer" value={damageCase.contractor} onSave={saveField} /><InlineDamageField editable={editable} field="damageLocation" label="Schadensort" value={damageCase.damageLocation} onSave={saveField} /></div><InlineDamageField editable={editable} field="description" label="Schadensbeschreibung / Sachverhalt" multiline value={damageCase.description} className="damage-inline-field--wide" onSave={saveField} /></dl></section>
    <section className="damage-detail-section" aria-labelledby="damage-technical-title"><h3 id="damage-technical-title">Technische Daten &amp; Haftung</h3><dl className="damage-inline-grid damage-inline-grid--technical"><InlineDamageField editable={editable} field="legalBasis" label="Rechtsgrundlage" options={[{ value: '', label: 'Nicht festgelegt' }, ...DAMAGE_LEGAL_BASES]} value={damageCase.legalBasis} displayValue={labelFor(DAMAGE_LEGAL_BASES, damageCase.legalBasis)} onSave={saveField} /><InlineDamageField editable={editable} field="cargoWeightKg" label="Gewicht der Ware in kg" type="number" value={damageCase.cargoWeightKg} displayValue={formatNumber(damageCase.cargoWeightKg, ' kg')} onSave={saveField} /><InlineDamageField editable={editable} field="liabilityLimit" label="Bemessungsgrenze / Haftungsgrenze" type="number" value={damageCase.liabilityLimit} displayValue={formatCurrency(damageCase.liabilityLimit)} onSave={saveField} /><InlineDamageField editable={editable} field="insuranceRelevance" label="Versicherungsrelevanz" options={[{ value: '', label: 'Nicht festgelegt' }, ...DAMAGE_INSURANCE_RELEVANCE]} value={damageCase.insuranceRelevance} displayValue={labelFor(DAMAGE_INSURANCE_RELEVANCE, damageCase.insuranceRelevance)} onSave={saveField} /><InlineDamageField editable={editable} field="bplInsurance" label="Versicherung BPL" value={damageCase.bplInsurance} onSave={saveField} /><InlineDamageField editable={editable} field="bplInsuranceCaseNumber" label="Schaden-/Vorgangsnummer Versicherung" value={damageCase.bplInsuranceCaseNumber} onSave={saveField} /><InlineDamageField editable={editable} field="contractorInsurance" label="Versicherung Unternehmer" value={damageCase.contractorInsurance} onSave={saveField} /><InlineDamageField editable={editable} field="contractorInsuranceCaseNumber" label="Schaden-/Vorgangsnummer Unternehmer-Versicherung" value={damageCase.contractorInsuranceCaseNumber} onSave={saveField} /><InlineDamageField editable={editable} field="contractorLiability" label="Haftung Unternehmer" options={[{ value: '', label: 'Nicht festgelegt' }, ...DAMAGE_CONTRACTOR_LIABILITY]} value={damageCase.contractorLiability} displayValue={labelFor(DAMAGE_CONTRACTOR_LIABILITY, damageCase.contractorLiability)} onSave={saveField} /><InlineDamageField editable={editable} field="liabilityNote" label="Bemerkung zu Haftung / Deckung" multiline value={damageCase.liabilityNote} className="damage-inline-field--wide" onSave={saveField} /></dl></section>
    <section className="todo-updates todo-history damage-updates" aria-labelledby="damage-updates-title"><div className="todo-updates__heading"><h3 id="damage-updates-title">Historie &amp; Updates</h3><span>{updates.length}</span></div>{editable && <form className="todo-updates__form" onSubmit={saveNote}><textarea aria-label="Update zum Fall" rows="2" value={note} maxLength="1000" onChange={(event) => setNote(event.target.value)} placeholder="Update zum Fall hinzufügen …" /><button className="button" type="submit" disabled={noteSaving || !note.trim()}>{noteSaving ? 'Wird gespeichert …' : 'Update hinzufügen'}</button></form>}{updatesLoading ? <p className="todo-updates__empty">Historie wird geladen …</p> : updates.length ? <ol className="todo-updates__list">{updates.map((update) => <li key={update.id} className={`todo-updates__item todo-updates__item--${update.type}`}><div><strong>{update.createdByName}</strong><span>{update.type === 'note' ? 'Update' : 'System'} · {formatTimestamp(update.createdAt)}</span></div><p>{update.text}</p></li>)}</ol> : <p className="todo-updates__empty">Noch keine Historieneinträge.</p>}</section>
  </div>
}
