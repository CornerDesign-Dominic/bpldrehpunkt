import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import DamageCaseEditModal from '../components/damages/DamageCaseEditModal.jsx'
import DamageDocumentsCard from '../components/damages/DamageDocumentsCard.jsx'
import DamageFinancialOverview from '../components/damages/DamageFinancialOverview.jsx'
import DocumentDetailsModal from '../components/documents/DocumentDetailsModal.jsx'
import DocumentForm from '../components/documents/DocumentForm.jsx'
import { ChevronDownIcon, EditIcon } from '../components/icons.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import Toast from '../components/ui/Toast.jsx'
import { useAuth } from '../auth/useAuth.js'
import { usePermissions } from '../auth/usePermissions.js'
import { listBusinessPartners } from '../lib/businessPartners.js'
import { createInternalDocument, deleteInternalDocument, getDocumentErrorMessage, listDamageCaseDocuments, updateInternalDocument } from '../lib/documents.js'
import { usePageHeader } from '../lib/pageHeader.js'
import { addDamageCaseUpdate, createDamageCaseMovement, DAMAGE_CONTRACTOR_LIABILITY, DAMAGE_INSURANCE_RELEVANCE, DAMAGE_LEGAL_BASES, damageCaseStatusLabel, damageDuePresentation, deleteDamageCaseMovement, getDamageCase, listDamageCaseMovements, listDamageCaseUpdates, updateDamageCaseFields, updateDamageCaseMovement } from '../lib/damages.js'
import { listVisibleUserDirectory } from '../lib/userProfiles.js'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorker

function formatDate(value) { return value ? new Intl.DateTimeFormat('de-DE').format(new Date(`${value}T12:00:00`)) : '—' }
function formatCurrency(value) { return value === null || value === undefined ? '—' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value) }
function formatNumber(value, suffix = '') { return value === null || value === undefined ? '—' : `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(value)}${suffix}` }
function labelFor(options, value) { return options.find((option) => option.value === value)?.label || '—' }
function formatTimestamp(value) { const date = value?.toDate?.(); return date ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : '—' }
function uploaderName(profile, user) { return [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim() || user?.email || '' }

async function getPdfPageCount(file) {
  const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  try {
    const pdf = await loadingTask.promise
    const pageCount = pdf.numPages
    await pdf.destroy()
    return pageCount
  } finally { loadingTask.destroy() }
}

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
  const canViewDocuments = canView('documents')
  const canEditDocuments = editable && canEdit('documents')
  const [damageCase, setDamageCase] = useState(null)
  const [users, setUsers] = useState([])
  const [partners, setPartners] = useState([])
  const [updates, setUpdates] = useState([])
  const [documents, setDocuments] = useState([])
  const [movements, setMovements] = useState([])
  const [loading, setLoading] = useState(true)
  const [updatesLoading, setUpdatesLoading] = useState(true)
  const [documentsLoading, setDocumentsLoading] = useState(false)
  const [movementsLoading, setMovementsLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [editingDocument, setEditingDocument] = useState(null)
  const [detailsDocument, setDetailsDocument] = useState(null)
  const [documentConfirmation, setDocumentConfirmation] = useState(null)
  const [documentSaving, setDocumentSaving] = useState(false)
  const [note, setNote] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  async function load() {
    const [entry, history, damageDocuments, damageMovements, directory, businessPartners] = await Promise.all([getDamageCase(damageCaseId), listDamageCaseUpdates(damageCaseId), canViewDocuments ? listDamageCaseDocuments(damageCaseId) : Promise.resolve([]), listDamageCaseMovements(damageCaseId), editable ? listVisibleUserDirectory() : Promise.resolve([]), editable && canViewMasterData ? listBusinessPartners() : Promise.resolve([])])
    setDamageCase(entry); setUpdates(history); setDocuments(damageDocuments); setMovements(damageMovements); setUsers(directory); setPartners(businessPartners); setTitle(entry?.caseNumber || ''); setUpdatesLoading(false); setDocumentsLoading(false); setMovementsLoading(false)
  }

  useEffect(() => {
    let current = true
    Promise.all([getDamageCase(damageCaseId), listDamageCaseUpdates(damageCaseId), canViewDocuments ? listDamageCaseDocuments(damageCaseId) : Promise.resolve([]), listDamageCaseMovements(damageCaseId), editable ? listVisibleUserDirectory() : Promise.resolve([]), editable && canViewMasterData ? listBusinessPartners() : Promise.resolve([])])
      .then(([entry, history, damageDocuments, damageMovements, directory, businessPartners]) => { if (current) { setDamageCase(entry); setUpdates(history); setDocuments(damageDocuments); setMovements(damageMovements); setUsers(directory); setPartners(businessPartners); setTitle(entry?.caseNumber || ''); setUpdatesLoading(false); setDocumentsLoading(false); setMovementsLoading(false) } })
      .catch((loadError) => { if (current) { setError(loadError.code === 'permission-denied' ? 'Kein Zugriff auf diesen Fall.' : 'Der Fall konnte nicht geladen werden.'); setUpdatesLoading(false); setDocumentsLoading(false); setMovementsLoading(false) } })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false; setTitle('') }
  }, [canViewDocuments, canViewMasterData, damageCaseId, editable, setTitle])

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

  async function saveDocument(values, file) {
    if (!canEditDocuments) return
    setError('')
    setDocumentSaving(true)
    try {
      const selectedDocument = editingDocument === 'new' ? null : editingDocument
      if (selectedDocument) await updateInternalDocument(selectedDocument, { ...values, damageCaseId: damageCase.id, damageCaseNumber: damageCase.caseNumber })
      else {
        let pageCount = null
        try { pageCount = await getPdfPageCount(file) } catch (pageCountError) { console.warn('Schäden: Seitenzahl des Dokuments konnte nicht ermittelt werden.', pageCountError) }
        await createInternalDocument({ ...values, damageCaseId: damageCase.id, damageCaseNumber: damageCase.caseNumber, pageCount }, file, { id: user?.uid, name: uploaderName(profile, user) })
      }
      await load()
      setEditingDocument(null)
      setToast(selectedDocument ? 'Dokument aktualisiert.' : 'Dokument hochgeladen.')
    } catch (saveError) {
      setError(getDocumentErrorMessage(saveError))
      throw saveError
    } finally { setDocumentSaving(false) }
  }

  async function deleteDocument(documentItem) {
    if (!canEditDocuments) return
    setError('')
    setDocumentSaving(true)
    try {
      await deleteInternalDocument(documentItem)
      await load()
      setDocumentConfirmation(null)
      setToast('Dokument dauerhaft gelöscht.')
    } catch (deleteError) {
      setError(getDocumentErrorMessage(deleteError))
      throw deleteError
    } finally { setDocumentSaving(false) }
  }

  async function saveMovement(existingMovement, values) {
    if (!editable) return
    setError('')
    try {
      if (existingMovement) await updateDamageCaseMovement(damageCase, existingMovement, values, { user, profile })
      else await createDamageCaseMovement(damageCase, values, { user, profile })
      await load()
      setToast(existingMovement ? 'Betragsbewegung aktualisiert.' : 'Betragsbewegung hinzugefügt.')
    } catch (saveError) {
      setError(saveError.message || 'Die Betragsbewegung konnte nicht gespeichert werden.')
      throw saveError
    }
  }

  async function deleteMovement(movement) {
    if (!editable) return
    setError('')
    try {
      await deleteDamageCaseMovement(damageCase, movement, { user, profile })
      await load()
      setToast('Betragsbewegung gelöscht.')
    } catch (deleteError) {
      setError(deleteError.message || 'Die Betragsbewegung konnte nicht gelöscht werden.')
      throw deleteError
    }
  }

  if (loading) return <p className="page-state">Fall wird geladen …</p>
  if (error && !damageCase) return <section className="damage-detail-empty"><h2>Fall nicht verfügbar</h2><p>{error}</p><Link className="button button--secondary" to="/schaeden">Zurück</Link></section>
  if (!damageCase) return null

  const due = damageDuePresentation(damageCase)
  const dueValue = damageCase.dueDate ? `${formatDate(damageCase.dueDate)} · ${due.label}` : '—'
  const title = `${damageCase.caseNumber} – ${damageCase.title || 'Ohne Kurzbezeichnung'}`
  const manualUpdates = updates.filter((update) => update.type === 'note')
  const history = updates.filter((update) => update.type === 'system')
  return <>
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    {detailsDocument && <DocumentDetailsModal documentItem={detailsDocument} onClose={() => setDetailsDocument(null)} />}
    <ConfirmDialog open={Boolean(documentConfirmation)} title="Dokument dauerhaft löschen?" message="Dieses Dokument wird dauerhaft gelöscht und kann nicht wiederhergestellt werden." confirmLabel="Endgültig löschen" submittingLabel="Wird gelöscht …" variant="danger" isSubmitting={documentSaving} onCancel={() => setDocumentConfirmation(null)} onConfirm={() => deleteDocument(documentConfirmation)} />
    {editingDocument && <div className="document-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !documentSaving) setEditingDocument(null) }}><section className="document-modal" role="dialog" aria-modal="true" aria-label={editingDocument === 'new' ? 'Dokument hochladen' : 'Dokument bearbeiten'}><DocumentForm key={editingDocument === 'new' ? 'new' : editingDocument.id} documentItem={editingDocument === 'new' ? null : editingDocument} hideExpirationDate onCancel={() => setEditingDocument(null)} onSubmit={saveDocument} /></section></div>}
    {editing && <DamageCaseEditModal key={editing} damageCase={damageCase} partners={partners} section={editing} users={users} onCancel={() => setEditing(null)} onSubmit={saveSection} />}
    <div className="todo-detail-navigation"><Link className="button button--secondary" to="/schaeden">← Zur Schäden-Übersicht</Link></div>
    <div className="todo-detail-page damage-detail-page">
      <header className="todo-detail-header"><div className="todo-detail-header__title"><h2>{title}</h2>{editable && <button className="todo-detail-section-edit" type="button" onClick={() => setEditing('title')} title="Falltitel bearbeiten" aria-label="Falltitel bearbeiten"><EditIcon size={14} /></button>}</div><span className={`todo-status damage-status damage-status--${damageCase.status}`}>{damageCaseStatusLabel(damageCase.status)}</span></header>
      {error && <p className="form-error">{error}</p>}
      <div className="todo-detail-layout">
        <main className="todo-detail-main">
          <section className="todo-detail-content"><DetailSectionHeading onEdit={editable ? () => setEditing('description') : null}>Schadenbeschreibung</DetailSectionHeading><p className="todo-detail-description">{damageCase.description || 'Keine Schadenbeschreibung hinterlegt.'}</p></section>
          {canViewDocuments && <DamageDocumentsCard canEdit={canEditDocuments} documents={documents} loading={documentsLoading} onDelete={(documentItem) => setDocumentConfirmation(documentItem)} onDetails={setDetailsDocument} onEdit={setEditingDocument} onUpload={() => setEditingDocument('new')} />}
          <DamageFinancialOverview canEdit={editable} loading={movementsLoading} movements={movements} onDelete={deleteMovement} onSave={saveMovement} />
          {(editable || updatesLoading || manualUpdates.length > 0) && <section className="todo-updates damage-case-updates" aria-labelledby="damage-update-title"><div className="todo-updates__heading"><h3 id="damage-update-title">Update zum Schaden</h3>{manualUpdates.length > 0 && <span>{manualUpdates.length}</span>}</div>{editable && <form className="todo-updates__form" onSubmit={saveNote}><textarea aria-label="Update zum Schaden" rows="2" value={note} maxLength="1000" onChange={(event) => setNote(event.target.value)} placeholder="Update zum Schaden hinzufügen …" /><button className="button" type="submit" disabled={noteSaving || !note.trim()}>{noteSaving ? 'Wird gespeichert …' : 'Update hinzufügen'}</button></form>}{updatesLoading ? <p className="todo-updates__empty">Updates werden geladen …</p> : manualUpdates.length > 0 && <ol className="todo-updates__list">{manualUpdates.map((update) => <li key={update.id} className="todo-updates__item todo-updates__item--note"><div><strong>{update.createdByName}</strong><span>Update · {formatTimestamp(update.createdAt)}</span></div><p>{update.text}</p></li>)}</ol>}</section>}
          <section className="todo-updates todo-history" aria-labelledby="damage-history-title"><div className="todo-updates__heading"><h3 id="damage-history-title">Historie</h3><span>{history.length}</span></div>{updatesLoading ? <p className="todo-updates__empty">Historie wird geladen …</p> : history.length ? <ol className="todo-updates__list">{history.map((update) => <li key={update.id} className="todo-updates__item todo-updates__item--system"><div><strong>{update.createdByName}</strong><span>System · {formatTimestamp(update.createdAt)}</span></div><p>{update.text}</p></li>)}</ol> : <p className="todo-updates__empty">Noch keine Historieneinträge.</p>}</section>
        </main>
        <aside className="todo-detail-sidebar">
          <CollapsibleDetailCard title="Allgemein" onEdit={editable ? () => setEditing('general') : null} primaryDetails={<><Detail label="Schadenhöhe">{formatCurrency(damageCase.damageAmount)}</Detail><Detail label="Nächste Frist"><span className={dueClass(damageCase)}>{dueValue}</span></Detail><Detail label="Verantwortliche Person">{damageCase.responsibleUserName}</Detail></>} secondaryDetails={<><Detail label="Schadenart">{damageCase.damageType}</Detail><Detail label="Schadendatum">{formatDate(damageCase.damageDate)}</Detail><Detail label="Aktennummer BPL-Versicherung">{damageCase.bplInsuranceCaseNumber}</Detail></>} secondaryValues={[damageCase.damageType, damageCase.damageDate, damageCase.bplInsuranceCaseNumber]} />
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
