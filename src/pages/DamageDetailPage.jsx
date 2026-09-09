import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import DamageCaseEditModal from '../components/damages/DamageCaseEditModal.jsx'
import { ChevronDownIcon, EditIcon } from '../components/icons.jsx'
import Toast from '../components/ui/Toast.jsx'
import { useAuth } from '../auth/useAuth.js'
import { usePermissions } from '../auth/usePermissions.js'
import { listBusinessPartners } from '../lib/businessPartners.js'
import { usePageHeader } from '../lib/pageHeader.js'
import { addDamageCaseUpdate, DAMAGE_CONTRACTOR_LIABILITY, DAMAGE_INSURANCE_RELEVANCE, DAMAGE_LEGAL_BASES, damageCaseStatusLabel, damageDuePresentation, getDamageCase, listDamageCaseUpdates, updateDamageCaseFields } from '../lib/damages.js'
import { listVisibleUserDirectory } from '../lib/userProfiles.js'

function formatDate(value) { return value ? new Intl.DateTimeFormat('de-DE').format(new Date(`${value}T12:00:00`)) : '—' }
function formatCurrency(value) { return value === null || value === undefined ? '—' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value) }
function formatNumber(value, suffix = '') { return value === null || value === undefined ? '—' : `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(value)}${suffix}` }
function labelFor(options, value) { return options.find((option) => option.value === value)?.label || '—' }
function formatTimestamp(value) { const date = value?.toDate?.(); return date ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : '—' }

function Detail({ label, children }) { return <div><dt>{label}</dt><dd>{children || '—'}</dd></div> }

function DetailSectionHeading({ children, onEdit }) {
  return <div className="todo-detail-section-heading"><h3>{children}</h3>{onEdit && <button className="todo-detail-section-edit" type="button" onClick={onEdit} title={`${children} bearbeiten`} aria-label={`${children} bearbeiten`}><EditIcon size={14} /></button>}</div>
}

function hasDetailValue(value) { return value !== null && value !== undefined && value !== '' }

function CollapsibleDetailCard({ title, onEdit, primaryDetails, secondaryDetails, secondaryValues }) {
  const [expanded, setExpanded] = useState(false)
  const filledSecondaryDetails = secondaryValues.filter(hasDetailValue).length
  const label = expanded ? 'Weitere Angaben ausblenden' : `Weitere Angaben anzeigen${filledSecondaryDetails ? ` (${filledSecondaryDetails})` : ''}`

  return <section className="damage-detail-card"><DetailSectionHeading onEdit={onEdit}>{title}</DetailSectionHeading><dl>{primaryDetails}</dl><button className={`damage-detail-card__toggle${expanded ? ' is-expanded' : ''}`} type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{label}<ChevronDownIcon size={14} /></button>{expanded && <dl className="damage-detail-card__additional">{secondaryDetails}</dl>}</section>
}

function dueClass(damageCase) {
  const due = damageDuePresentation(damageCase)
  if (due.kind === 'overdue' || due.kind === 'today') return 'due-date due-date--overdue'
  return due.kind === 'soon' ? 'due-date due-date--soon' : 'due-date'
}

function sectionMessages(section, previous, changes) {
  if (section === 'general') {
    const messages = []
    if (changes.status) messages.push(`Status von ${damageCaseStatusLabel(previous.status)} zu ${damageCaseStatusLabel(changes.status)} geändert`)
    if (Object.hasOwn(changes, 'dueDate')) messages.push(changes.dueDate ? `Frist geändert auf ${formatDate(changes.dueDate)}` : 'Frist entfernt')
    if (Object.keys(changes).some((field) => !['status', 'dueDate'].includes(field))) messages.push('Allgemeine Falldaten aktualisiert')
    return messages
  }
  return {
    title: 'Falltitel aktualisiert',
    description: 'Schadenbeschreibung aktualisiert',
    general: 'Allgemeine Falldaten aktualisiert',
    links: 'Verknüpfungen aktualisiert',
    claimant: 'Kunde & Anspruch aktualisiert',
    contractor: 'Unternehmer & Versicherung aktualisiert',
    liability: 'Haftungsgrundlage aktualisiert',
  }[section]
}

export default function DamageDetailPage() {
  const { damageCaseId } = useParams()
  const { user, profile } = useAuth()
  const { canEdit, canView } = usePermissions()
  const { setTitle } = usePageHeader()
  const editable = canEdit('damages')
  const canViewMasterData = canView('masterData')
  const [damageCase, setDamageCase] = useState(null)
  const [users, setUsers] = useState([])
  const [partners, setPartners] = useState([])
  const [updates, setUpdates] = useState([])
  const [loading, setLoading] = useState(true)
  const [updatesLoading, setUpdatesLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [note, setNote] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  async function load() {
    const [entry, history, directory, businessPartners] = await Promise.all([getDamageCase(damageCaseId), listDamageCaseUpdates(damageCaseId), editable ? listVisibleUserDirectory() : Promise.resolve([]), editable && canViewMasterData ? listBusinessPartners() : Promise.resolve([])])
    setDamageCase(entry); setUpdates(history); setUsers(directory); setPartners(businessPartners); setTitle(entry?.caseNumber || ''); setUpdatesLoading(false)
  }

  useEffect(() => {
    let current = true
    Promise.all([getDamageCase(damageCaseId), listDamageCaseUpdates(damageCaseId), editable ? listVisibleUserDirectory() : Promise.resolve([]), editable && canViewMasterData ? listBusinessPartners() : Promise.resolve([])])
      .then(([entry, history, directory, businessPartners]) => { if (current) { setDamageCase(entry); setUpdates(history); setUsers(directory); setPartners(businessPartners); setTitle(entry?.caseNumber || ''); setUpdatesLoading(false) } })
      .catch((loadError) => { if (current) { setError(loadError.code === 'permission-denied' ? 'Kein Zugriff auf diesen Fall.' : 'Der Fall konnte nicht geladen werden.'); setUpdatesLoading(false) } })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false; setTitle('') }
  }, [canViewMasterData, damageCaseId, editable, setTitle])

  const usersById = useMemo(() => new Map(users.map((entry) => [entry.id, entry])), [users])

  async function saveSection(section, changes) {
    setError('')
    try {
      const changed = await updateDamageCaseFields(damageCase, changes, { user, profile }, usersById, sectionMessages(section, damageCase, changes))
      if (changed) { await load(); setToast('Änderung gespeichert.') }
      setEditing(null)
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
  if (error && !damageCase) return <section className="damage-detail-empty"><h2>Fall nicht verfügbar</h2><p>{error}</p><Link className="button button--secondary" to="/schaeden">Zurück</Link></section>
  if (!damageCase) return null

  const due = damageDuePresentation(damageCase)
  const dueValue = damageCase.dueDate ? `${formatDate(damageCase.dueDate)} · ${due.label}` : '—'
  const title = `${damageCase.caseNumber} – ${damageCase.title || 'Ohne Kurzbezeichnung'}`
  return <>
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    {editing && <DamageCaseEditModal key={editing} damageCase={damageCase} partners={partners} section={editing} users={users} onCancel={() => setEditing(null)} onSubmit={saveSection} />}
    <div className="todo-detail-navigation"><Link className="button button--secondary" to="/schaeden">← Zur Schäden-Übersicht</Link></div>
    <div className="todo-detail-page damage-detail-page">
      <header className="todo-detail-header"><div className="todo-detail-header__title"><h2>{title}</h2>{editable && <button className="todo-detail-section-edit" type="button" onClick={() => setEditing('title')} title="Falltitel bearbeiten" aria-label="Falltitel bearbeiten"><EditIcon size={14} /></button>}</div><span className={`todo-status damage-status damage-status--${damageCase.status}`}>{damageCaseStatusLabel(damageCase.status)}</span></header>
      {error && <p className="form-error">{error}</p>}
      <div className="todo-detail-layout">
        <main className="todo-detail-main">
          <section className="todo-detail-content"><DetailSectionHeading onEdit={editable ? () => setEditing('description') : null}>Schadenbeschreibung</DetailSectionHeading><p className="todo-detail-description">{damageCase.description || 'Keine Schadenbeschreibung hinterlegt.'}</p></section>
          {editable && <section className="todo-updates damage-case-updates" aria-labelledby="damage-update-title"><div className="todo-updates__heading"><h3 id="damage-update-title">Update zum Schaden</h3></div><form className="todo-updates__form" onSubmit={saveNote}><textarea aria-label="Update zum Schaden" rows="2" value={note} maxLength="1000" onChange={(event) => setNote(event.target.value)} placeholder="Update zum Schaden hinzufügen …" /><button className="button" type="submit" disabled={noteSaving || !note.trim()}>{noteSaving ? 'Wird gespeichert …' : 'Update hinzufügen'}</button></form></section>}
          <section className="todo-updates todo-history" aria-labelledby="damage-history-title"><div className="todo-updates__heading"><h3 id="damage-history-title">Historie</h3><span>{updates.length}</span></div>{updatesLoading ? <p className="todo-updates__empty">Historie wird geladen …</p> : updates.length ? <ol className="todo-updates__list">{updates.map((update) => <li key={update.id} className={`todo-updates__item todo-updates__item--${update.type}`}><div><strong>{update.createdByName}</strong><span>{update.type === 'note' ? 'Update' : 'System'} · {formatTimestamp(update.createdAt)}</span></div><p>{update.text}</p></li>)}</ol> : <p className="todo-updates__empty">Noch keine Historieneinträge.</p>}</section>
        </main>
        <aside className="todo-detail-sidebar">
          <CollapsibleDetailCard title="Allgemein" onEdit={editable ? () => setEditing('general') : null} primaryDetails={<><Detail label="Status"><span className={`todo-status damage-status damage-status--${damageCase.status}`}>{damageCaseStatusLabel(damageCase.status)}</span></Detail><Detail label="Nächste Frist"><span className={dueClass(damageCase)}>{dueValue}</span></Detail><Detail label="Schadenhöhe">{formatCurrency(damageCase.damageAmount)}</Detail><Detail label="Verantwortliche Person">{damageCase.responsibleUserName}</Detail></>} secondaryDetails={<><Detail label="Schadenart">{damageCase.damageType}</Detail><Detail label="Schadendatum">{formatDate(damageCase.damageDate)}</Detail><Detail label="Aktennummer BPL-Versicherung">{damageCase.bplInsuranceCaseNumber}</Detail></>} secondaryValues={[damageCase.damageType, damageCase.damageDate, damageCase.bplInsuranceCaseNumber]} />
          <section><DetailSectionHeading onEdit={editable ? () => setEditing('links') : null}>Verknüpfungen</DetailSectionHeading><dl><Detail label="TA-Nummer">{damageCase.transportReference}</Detail></dl></section>
          <CollapsibleDetailCard title="Kunde & Anspruch" onEdit={editable ? () => setEditing('claimant') : null} primaryDetails={<Detail label="Kunde / Anspruchsteller">{damageCase.claimantPartnerId && canViewMasterData ? <Link to={`/kunden-unternehmer/${damageCase.claimantPartnerId}`}>{damageCase.claimant || 'Kunde öffnen'}</Link> : damageCase.claimant}</Detail>} secondaryDetails={<><Detail label="Versicherung Kunde">{damageCase.customerInsurance}</Detail><Detail label="Vorgangsnummer Kunde">{damageCase.customerInsuranceNumber}</Detail></>} secondaryValues={[damageCase.customerInsurance, damageCase.customerInsuranceNumber]} />
          <CollapsibleDetailCard title="Unternehmer & Versicherung" onEdit={editable ? () => setEditing('contractor') : null} primaryDetails={<><Detail label="Unternehmer">{damageCase.contractorPartnerId && canViewMasterData ? <Link to={`/kunden-unternehmer/${damageCase.contractorPartnerId}`}>{damageCase.contractor || 'Unternehmer öffnen'}</Link> : damageCase.contractor}</Detail><Detail label="Haftung Unternehmer">{labelFor(DAMAGE_CONTRACTOR_LIABILITY, damageCase.contractorLiability)}</Detail></>} secondaryDetails={<><Detail label="Versicherer UTN">{damageCase.contractorInsurance}</Detail><Detail label="Vorgangsnummer Unternehmer">{damageCase.contractorInsuranceCaseNumber}</Detail></>} secondaryValues={[damageCase.contractorInsurance, damageCase.contractorInsuranceCaseNumber]} />
          <CollapsibleDetailCard title="Haftungsgrundlage" onEdit={editable ? () => setEditing('liability') : null} primaryDetails={<><Detail label="Rechtsgrundlage">{labelFor(DAMAGE_LEGAL_BASES, damageCase.legalBasis)}</Detail><Detail label="Bemessungs-/Haftungsgrenze">{formatCurrency(damageCase.liabilityLimit)}</Detail></>} secondaryDetails={<><Detail label="Gewicht der Ware">{formatNumber(damageCase.cargoWeightKg, ' kg')}</Detail><Detail label="Versicherungsrelevanz">{labelFor(DAMAGE_INSURANCE_RELEVANCE, damageCase.insuranceRelevance)}</Detail></>} secondaryValues={[damageCase.cargoWeightKg, damageCase.insuranceRelevance]} />
          <section className="todo-detail-system"><h3>Systemdaten</h3><dl><Detail label="Erstellt von">{damageCase.createdByName}</Detail><Detail label="Erstellt am">{formatTimestamp(damageCase.createdAt)}</Detail><Detail label="Zuletzt aktualisiert">{formatTimestamp(damageCase.updatedAt)}</Detail></dl></section>
        </aside>
      </div>
    </div>
  </>
}
