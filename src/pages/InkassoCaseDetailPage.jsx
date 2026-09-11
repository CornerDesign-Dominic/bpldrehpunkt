import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import InkassoCaseEditModal from '../components/inkasso/InkassoCaseEditModal.jsx'
import InkassoFinancialOverview from '../components/inkasso/InkassoFinancialOverview.jsx'
import DamageDocumentsCard from '../components/damages/DamageDocumentsCard.jsx'
import DocumentDetailsModal from '../components/documents/DocumentDetailsModal.jsx'
import DocumentForm from '../components/documents/DocumentForm.jsx'
import { EditIcon } from '../components/icons.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import Toast from '../components/ui/Toast.jsx'
import { useAuth } from '../auth/useAuth.js'
import { usePermissions } from '../auth/usePermissions.js'
import { getDocumentErrorMessage } from '../lib/documents.js'
import { createInkassoCaseDocument, deleteInkassoCaseDocument, getInkassoCaseDocumentBlob, listInkassoCaseDocuments, updateInkassoCaseDocument } from '../lib/inkassoDocuments.js'
import { addInkassoCaseSystemUpdate, addInkassoCaseUpdate, createInkassoCaseMovement, deleteInkassoCaseMovement, getInkassoCase, inkassoCaseStatusLabel, listInkassoCaseMovements, listInkassoCaseUpdates, updateInkassoCaseFields, updateInkassoCaseMovement } from '../lib/inkasso.js'
import { usePageHeader } from '../lib/pageHeader.js'
import { getUserDisplayName, listVisibleUserDirectory } from '../lib/userProfiles.js'

function formatDate(value) { return value ? new Intl.DateTimeFormat('de-DE').format(new Date(`${value}T12:00:00`)) : '—' }
function formatTimestamp(value) { const date = value?.toDate?.(); return date ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : '—' }
function hasValue(value) { return value !== null && value !== undefined && value !== '' }
function Detail({ label, children }) { return <div><dt>{label}</dt><dd>{children || '—'}</dd></div> }

function InformationSection({ title, children, values, onEdit }) {
  if (!values.some(hasValue)) return null
  return <section><div className="todo-detail-section-heading"><h3>{title}</h3>{onEdit && <button className="todo-detail-section-edit" type="button" onClick={onEdit} aria-label="Fallinformationen bearbeiten" title="Fallinformationen bearbeiten"><EditIcon size={14} /></button>}</div><dl>{children}</dl></section>
}

export default function InkassoCaseDetailPage() {
  const { caseId } = useParams()
  const { user, profile } = useAuth()
  const { canEdit } = usePermissions()
  const { setTitle } = usePageHeader()
  const editable = canEdit('inkasso')
  const [inkassoCase, setInkassoCase] = useState(null)
  const [users, setUsers] = useState([])
  const [updates, setUpdates] = useState([])
  const [documents, setDocuments] = useState([])
  const [movements, setMovements] = useState([])
  const [loading, setLoading] = useState(true)
  const [updatesLoading, setUpdatesLoading] = useState(true)
  const [documentsLoading, setDocumentsLoading] = useState(true)
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
    const [entry, caseUpdates, caseDocuments, caseMovements, directory] = await Promise.all([getInkassoCase(caseId), listInkassoCaseUpdates(caseId), listInkassoCaseDocuments(caseId), listInkassoCaseMovements(caseId), editable ? listVisibleUserDirectory() : Promise.resolve([])])
    setInkassoCase(entry); setUpdates(caseUpdates); setDocuments(caseDocuments); setMovements(caseMovements); setUsers(directory); setTitle(entry?.caseNumber || ''); setUpdatesLoading(false); setDocumentsLoading(false); setMovementsLoading(false)
  }

  useEffect(() => {
    let current = true
    Promise.all([getInkassoCase(caseId), listInkassoCaseUpdates(caseId), listInkassoCaseDocuments(caseId), listInkassoCaseMovements(caseId), editable ? listVisibleUserDirectory() : Promise.resolve([])])
      .then(([entry, caseUpdates, caseDocuments, caseMovements, directory]) => { if (current) { setInkassoCase(entry); setUpdates(caseUpdates); setDocuments(caseDocuments); setMovements(caseMovements); setUsers(directory); setTitle(entry?.caseNumber || ''); setUpdatesLoading(false); setDocumentsLoading(false); setMovementsLoading(false) } })
      .catch((loadError) => { if (current) { setError(loadError.code === 'permission-denied' ? 'Kein Zugriff auf diesen Inkassofall.' : 'Der Inkassofall konnte nicht geladen werden.'); setUpdatesLoading(false); setDocumentsLoading(false); setMovementsLoading(false) } })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false; setTitle('') }
  }, [caseId, editable, setTitle])

  const usersById = useMemo(() => new Map(users.map((entry) => [entry.id, entry])), [users])

  async function saveCase(values) {
    setError('')
    try { const changed = await updateInkassoCaseFields(inkassoCase, values, { user, profile }, usersById); if (changed) { await load(); setToast('Fallinformationen gespeichert.') } } catch (saveError) { setError(saveError.message || 'Die Änderung konnte nicht gespeichert werden.'); throw saveError }
  }

  async function saveNote(event) {
    event.preventDefault(); setNoteSaving(true); setError('')
    try { await addInkassoCaseUpdate(inkassoCase, note, { user, profile }); setNote(''); await load(); setToast('Update hinzugefügt.') } catch (saveError) { setError(saveError.message || 'Das Update konnte nicht gespeichert werden.') } finally { setNoteSaving(false) }
  }

  async function saveDocument(values, file) {
    setDocumentSaving(true); setError('')
    try {
      const existing = editingDocument === 'new' ? null : editingDocument
      const title = (values.title || existing?.title || file?.name || 'Unbenanntes Dokument').trim()
      const actorName = getUserDisplayName(profile, user) || 'Ein Nutzer'
      if (existing) { await updateInkassoCaseDocument(inkassoCase.id, existing, values); await addInkassoCaseSystemUpdate(inkassoCase, `${actorName} hat die Dokumentdetails von „${title}“ bearbeitet.`, { user, profile }) } else { await createInkassoCaseDocument(inkassoCase.id, values, file, { id: user?.uid, name: actorName }); await addInkassoCaseSystemUpdate(inkassoCase, `${actorName} hat das Dokument „${title}“ hochgeladen.`, { user, profile }) }
      await load(); setEditingDocument(null); setToast(existing ? 'Dokument aktualisiert.' : 'Dokument hochgeladen.')
    } catch (saveError) { setError(getDocumentErrorMessage(saveError)); throw saveError } finally { setDocumentSaving(false) }
  }

  async function deleteDocument(documentItem) {
    setDocumentSaving(true); setError('')
    try { await deleteInkassoCaseDocument(inkassoCase.id, documentItem); await addInkassoCaseSystemUpdate(inkassoCase, `${getUserDisplayName(profile, user) || 'Ein Nutzer'} hat das Dokument „${documentItem.title || documentItem.fileName || 'Unbenanntes Dokument'}“ gelöscht.`, { user, profile }); await load(); setDocumentConfirmation(null); setToast('Dokument dauerhaft gelöscht.') } catch (deleteError) { setError(getDocumentErrorMessage(deleteError)); throw deleteError } finally { setDocumentSaving(false) }
  }

  async function saveMovement(existingMovement, values) {
    setError('')
    try { if (existingMovement) await updateInkassoCaseMovement(inkassoCase, existingMovement, values, { user, profile }); else await createInkassoCaseMovement(inkassoCase, values, { user, profile }); await load(); setToast(existingMovement ? 'Betragsbewegung aktualisiert.' : 'Betragsbewegung hinzugefügt.') } catch (saveError) { setError(saveError.message || 'Die Betragsbewegung konnte nicht gespeichert werden.'); throw saveError }
  }

  async function deleteMovement(movement) {
    setError('')
    try { await deleteInkassoCaseMovement(inkassoCase, movement, { user, profile }); await load(); setToast('Betragsbewegung gelöscht.') } catch (deleteError) { setError(deleteError.message || 'Die Betragsbewegung konnte nicht gelöscht werden.'); throw deleteError }
  }

  if (loading) return <p className="page-state">Inkassofall wird geladen …</p>
  if (error && !inkassoCase) return <section className="damage-detail-empty"><h2>Inkassofall nicht verfügbar</h2><p>{error}</p><Link className="button button--secondary" to="/inkasso">Zurück</Link></section>
  if (!inkassoCase) return null

  const manualUpdates = updates.filter((update) => update.type === 'note')
  const history = updates.filter((update) => update.type === 'system')
  const title = `${inkassoCase.caseNumber || 'Inkassofall'} – ${inkassoCase.title || inkassoCase.debtorName || 'Ohne Bezeichnung'}`
  const allInformationValues = [inkassoCase.caseNumber, inkassoCase.status, inkassoCase.responsibleUserName, inkassoCase.createdAt, inkassoCase.completedAt, inkassoCase.debtorName, inkassoCase.debtorNumber, inkassoCase.debtorContactName, inkassoCase.debtorAddress, inkassoCase.debtorEmail, inkassoCase.debtorPhone, inkassoCase.invoiceNumbers, inkassoCase.invoiceDate, inkassoCase.originalDueDate, inkassoCase.lastReminderDate, inkassoCase.lawFirm, inkassoCase.lawyerReference, inkassoCase.lawFirmContactName, inkassoCase.lawFirmEmail, inkassoCase.lawFirmPhone, inkassoCase.lawyerHandoverDate, inkassoCase.court, inkassoCase.courtReference, inkassoCase.paymentOrderDate, inkassoCase.enforcementOrderDate, inkassoCase.titleAvailable]

  return <>
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    {detailsDocument && <DocumentDetailsModal documentItem={detailsDocument} onClose={() => setDetailsDocument(null)} />}
    <ConfirmDialog open={Boolean(documentConfirmation)} title="Dokument dauerhaft löschen?" message="Dieses Dokument wird dauerhaft gelöscht und kann nicht wiederhergestellt werden." confirmLabel="Endgültig löschen" submittingLabel="Wird gelöscht …" variant="danger" isSubmitting={documentSaving} onCancel={() => setDocumentConfirmation(null)} onConfirm={() => deleteDocument(documentConfirmation)} />
    {editingDocument && <div className="document-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !documentSaving) setEditingDocument(null) }}><section className="document-modal" role="dialog" aria-modal="true" aria-label={editingDocument === 'new' ? 'Dokument hochladen' : 'Dokument bearbeiten'}><DocumentForm key={editingDocument === 'new' ? 'new' : editingDocument.id} documentItem={editingDocument === 'new' ? null : editingDocument} hideExpirationDate onCancel={() => setEditingDocument(null)} onSubmit={saveDocument} /></section></div>}
    {editing && <InkassoCaseEditModal inkassoCase={inkassoCase} mode={editing} users={users} onCancel={() => setEditing(null)} onSubmit={saveCase} />}
    <div className="todo-detail-navigation"><Link className="button button--secondary" to="/inkasso">← Zur Inkasso-Übersicht</Link></div>
    <div className="todo-detail-page damage-detail-page inkasso-detail-page">
      <header className="todo-detail-header"><div className="todo-detail-header__title"><h2>{title}</h2></div><span className={`todo-status damage-status damage-status--${inkassoCase.status}`}>{inkassoCaseStatusLabel(inkassoCase.status)}</span></header>
      {error && <p className="form-error">{error}</p>}
      <div className="todo-detail-layout">
        <main className="todo-detail-main">
          <section className="todo-detail-content"><div className="todo-detail-section-heading"><h3>Beschreibung</h3>{editable && <button className="todo-detail-section-edit" type="button" onClick={() => setEditing('description')} aria-label="Beschreibung bearbeiten" title="Beschreibung bearbeiten"><EditIcon size={14} /></button>}</div><p className="todo-detail-description">{inkassoCase.description || 'Keine Beschreibung hinterlegt.'}</p></section>
          <DamageDocumentsCard canEdit={editable} documents={documents} getDocumentBlob={getInkassoCaseDocumentBlob} loading={documentsLoading} onDelete={setDocumentConfirmation} onDetails={setDetailsDocument} onEdit={setEditingDocument} onUpload={() => setEditingDocument('new')} />
          <InkassoFinancialOverview canEdit={editable} loading={movementsLoading} movements={movements} onDelete={deleteMovement} onSave={saveMovement} />
          {(editable || updatesLoading || manualUpdates.length > 0) && <section className="todo-updates damage-case-updates" aria-labelledby="inkasso-update-title"><div className="todo-updates__heading"><h3 id="inkasso-update-title">Updates</h3>{manualUpdates.length > 0 && <span>{manualUpdates.length}</span>}</div>{editable && <form className="todo-updates__form" onSubmit={saveNote}><textarea aria-label="Update zum Inkassofall" rows="2" value={note} maxLength="1000" onChange={(event) => setNote(event.target.value)} placeholder="Update zum Inkassofall hinzufügen …" /><button className="button" type="submit" disabled={noteSaving || !note.trim()}>{noteSaving ? 'Wird gespeichert …' : 'Update hinzufügen'}</button></form>}{updatesLoading ? <p className="todo-updates__empty">Updates werden geladen …</p> : !manualUpdates.length ? <p className="todo-updates__empty">Noch keine Updates zum Inkassofall.</p> : <ol className="todo-updates__list">{manualUpdates.map((update) => <li key={update.id} className="todo-updates__item todo-updates__item--note"><div><strong>{update.createdByName}</strong><span>Update · {formatTimestamp(update.createdAt)}</span></div><p>{update.text}</p></li>)}</ol>}</section>}
          <section className="todo-updates todo-history" aria-labelledby="inkasso-history-title"><div className="todo-updates__heading"><h3 id="inkasso-history-title">Historie</h3><span>{history.length}</span></div>{updatesLoading ? <p className="todo-updates__empty">Historie wird geladen …</p> : !history.length ? <p className="todo-updates__empty">Noch keine Historieneinträge.</p> : <ol className="todo-updates__list">{history.map((update) => <li key={update.id} className="todo-updates__item todo-updates__item--system"><div><strong>{update.createdByName}</strong><span>System · {formatTimestamp(update.createdAt)}</span></div><p>{update.text}</p></li>)}</ol>}</section>
        </main>
        <aside className="todo-detail-sidebar">
          <InformationSection title="Fallinformationen" values={allInformationValues} onEdit={editable ? () => setEditing('information') : null}><Detail label="Interne Fallnummer">{inkassoCase.caseNumber}</Detail><Detail label="Status">{inkassoCaseStatusLabel(inkassoCase.status)}</Detail><Detail label="Zuständig">{inkassoCase.responsibleUserName}</Detail><Detail label="Erstellt am">{formatTimestamp(inkassoCase.createdAt)}</Detail>{inkassoCase.completedAt && <Detail label="Abgeschlossen am">{formatTimestamp(inkassoCase.completedAt)}</Detail>}</InformationSection>
          <InformationSection title="Schuldner" values={[inkassoCase.debtorName, inkassoCase.debtorNumber, inkassoCase.debtorContactName, inkassoCase.debtorAddress, inkassoCase.debtorEmail, inkassoCase.debtorPhone]}><Detail label="Schuldner / Unternehmen">{inkassoCase.debtorName}</Detail><Detail label="Debitorennummer">{inkassoCase.debtorNumber}</Detail><Detail label="Ansprechpartner">{inkassoCase.debtorContactName}</Detail><Detail label="Anschrift">{inkassoCase.debtorAddress}</Detail><Detail label="E-Mail">{inkassoCase.debtorEmail}</Detail><Detail label="Telefon">{inkassoCase.debtorPhone}</Detail></InformationSection>
          <InformationSection title="Forderung" values={[inkassoCase.invoiceNumbers, inkassoCase.invoiceDate, inkassoCase.originalDueDate, inkassoCase.lastReminderDate]}><Detail label="Rechnungsnummer(n)">{inkassoCase.invoiceNumbers}</Detail><Detail label="Rechnungsdatum">{formatDate(inkassoCase.invoiceDate)}</Detail><Detail label="Ursprüngliche Fälligkeit">{formatDate(inkassoCase.originalDueDate)}</Detail><Detail label="Datum letzte Mahnung">{formatDate(inkassoCase.lastReminderDate)}</Detail></InformationSection>
          <InformationSection title="Rechtsanwalt / externe Bearbeitung" values={[inkassoCase.lawFirm, inkassoCase.lawyerReference, inkassoCase.lawFirmContactName, inkassoCase.lawFirmEmail, inkassoCase.lawFirmPhone, inkassoCase.lawyerHandoverDate]}><Detail label="Kanzlei">{inkassoCase.lawFirm}</Detail><Detail label="Aktenzeichen Kanzlei">{inkassoCase.lawyerReference}</Detail><Detail label="Ansprechpartner">{inkassoCase.lawFirmContactName}</Detail><Detail label="E-Mail">{inkassoCase.lawFirmEmail}</Detail><Detail label="Telefon">{inkassoCase.lawFirmPhone}</Detail><Detail label="Übergabe an Rechtsanwalt">{formatDate(inkassoCase.lawyerHandoverDate)}</Detail></InformationSection>
          <InformationSection title="Gerichtliche Informationen" values={[inkassoCase.court, inkassoCase.courtReference, inkassoCase.paymentOrderDate, inkassoCase.enforcementOrderDate, inkassoCase.titleAvailable]}><Detail label="Zuständiges Gericht">{inkassoCase.court}</Detail><Detail label="Gerichtliches Aktenzeichen">{inkassoCase.courtReference}</Detail><Detail label="Mahnbescheid">{formatDate(inkassoCase.paymentOrderDate)}</Detail><Detail label="Vollstreckungsbescheid">{formatDate(inkassoCase.enforcementOrderDate)}</Detail><Detail label="Titel vorhanden">{inkassoCase.titleAvailable ? 'Ja' : 'Nein'}</Detail></InformationSection>
        </aside>
      </div>
    </div>
  </>
}
