import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import InkassoCaseEditModal from '../components/inkasso/InkassoCaseEditModal.jsx'
import InkassoDeadlinesCard from '../components/inkasso/InkassoDeadlinesCard.jsx'
import InkassoInvoicesCard from '../components/inkasso/InkassoInvoicesCard.jsx'
import LinkedTodoCreateModal from '../components/todos/LinkedTodoCreateModal.jsx'
import LinkedTodosCard from '../components/todos/LinkedTodosCard.jsx'
import DamageDocumentsCard from '../components/damages/DamageDocumentsCard.jsx'
import DocumentDetailsModal from '../components/documents/DocumentDetailsModal.jsx'
import DocumentForm from '../components/documents/DocumentForm.jsx'
import { EditIcon } from '../components/icons.jsx'
import BackLink from '../components/ui/BackLink.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import Toast from '../components/ui/Toast.jsx'
import { useAuth } from '../auth/useAuth.js'
import { usePermissions } from '../auth/usePermissions.js'
import { getDocumentErrorMessage } from '../lib/documents.js'
import { createInkassoCaseDocument, deleteInkassoCaseDocument, getInkassoCaseDocumentBlob, listInkassoCaseDocuments, updateInkassoCaseDocument } from '../lib/inkassoDocuments.js'
import { addInkassoCaseUpdate, createInkassoCaseDeadline, createInkassoCaseInvoice, createInkassoCaseMovement, deleteInkassoCaseDeadline, deleteInkassoCaseMovement, getInkassoCase, inkassoCaseStatusLabel, listInkassoCaseDeadlines, listInkassoCaseHistory, listInkassoCaseInvoices, listInkassoCaseMovements, listInkassoCaseUpdates, updateInkassoCaseDeadline, updateInkassoCaseFields, updateInkassoCaseInvoice, updateInkassoCaseMovement, updateInkassoInvoicePayment } from '../lib/inkasso.js'
import { usePageHeader } from '../lib/pageHeader.js'
import { getUserDisplayName } from '../lib/userProfiles.js'
import { useLinkedTodos } from '../components/todos/useLinkedTodos.js'

function formatTimestamp(value) { const date = value?.toDate?.(); return date ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : '—' }
function hasValue(value) { return value !== null && value !== undefined && value !== '' }
function Detail({ label, children }) { return <div><dt>{label}</dt><dd>{children || '—'}</dd></div> }

function InformationSection({ title, children, values, onEdit }) {
  if (!values.some(hasValue)) return null
  return <section><div className="todo-detail-section-heading"><h3>{title}</h3>{onEdit && <button className="todo-detail-section-edit" type="button" onClick={onEdit} aria-label={`${title} bearbeiten`} title={`${title} bearbeiten`}><EditIcon size={14} /></button>}</div><dl>{children}</dl></section>
}

export default function InkassoCaseDetailPage() {
  const { caseId } = useParams()
  const { user, profile } = useAuth()
  const { canEdit, canView } = usePermissions()
  const { setTitle } = usePageHeader()
  const editable = canEdit('inkasso')
  const canCreateTodos = canEdit('todos')
  const canViewTodos = canView('todos')
  const canViewMasterData = canView('masterData')
  const [inkassoCase, setInkassoCase] = useState(null)
  const [updates, setUpdates] = useState([])
  const [historyEntries, setHistoryEntries] = useState([])
  const [documents, setDocuments] = useState([])
  const [invoices, setInvoices] = useState([])
  const [deadlines, setDeadlines] = useState([])
  const [movements, setMovements] = useState([])
  const [loading, setLoading] = useState(true)
  const [updatesLoading, setUpdatesLoading] = useState(true)
  const [documentsLoading, setDocumentsLoading] = useState(true)
  const [invoicesLoading, setInvoicesLoading] = useState(true)
  const [deadlinesLoading, setDeadlinesLoading] = useState(true)
  const [movementsLoading, setMovementsLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [editingDocument, setEditingDocument] = useState(null)
  const [detailsDocument, setDetailsDocument] = useState(null)
  const [documentConfirmation, setDocumentConfirmation] = useState(null)
  const [documentSaving, setDocumentSaving] = useState(false)
  const [savingInvoiceId, setSavingInvoiceId] = useState('')
  const [note, setNote] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [showTodoCreate, setShowTodoCreate] = useState(false)
  const { createLinkedTodo, linkedTodoLoading, linkedTodos, todoPartners, todoUsers } = useLinkedTodos({ canCreate: canCreateTodos, canViewMasterData, canViewTodos, caseField: 'inkassoCaseId', caseId, profile, user })

  async function load() {
    const [entry, caseUpdates, caseHistory, caseDocuments, caseInvoices, caseDeadlines, caseMovements] = await Promise.all([getInkassoCase(caseId), listInkassoCaseUpdates(caseId), listInkassoCaseHistory(caseId), listInkassoCaseDocuments(caseId), listInkassoCaseInvoices(caseId), listInkassoCaseDeadlines(caseId), listInkassoCaseMovements(caseId)])
    setInkassoCase(entry); setUpdates(caseUpdates); setHistoryEntries(caseHistory); setDocuments(caseDocuments); setInvoices(caseInvoices); setDeadlines(caseDeadlines); setMovements(caseMovements); setTitle(entry?.caseNumber || ''); setUpdatesLoading(false); setDocumentsLoading(false); setInvoicesLoading(false); setDeadlinesLoading(false); setMovementsLoading(false)
  }

  useEffect(() => {
    let current = true
    Promise.all([getInkassoCase(caseId), listInkassoCaseUpdates(caseId), listInkassoCaseHistory(caseId), listInkassoCaseDocuments(caseId), listInkassoCaseInvoices(caseId), listInkassoCaseDeadlines(caseId), listInkassoCaseMovements(caseId)])
      .then(([entry, caseUpdates, caseHistory, caseDocuments, caseInvoices, caseDeadlines, caseMovements]) => { if (current) { setInkassoCase(entry); setUpdates(caseUpdates); setHistoryEntries(caseHistory); setDocuments(caseDocuments); setInvoices(caseInvoices); setDeadlines(caseDeadlines); setMovements(caseMovements); setTitle(entry?.caseNumber || ''); setUpdatesLoading(false); setDocumentsLoading(false); setInvoicesLoading(false); setDeadlinesLoading(false); setMovementsLoading(false) } })
      .catch((loadError) => { if (current) { setError(loadError.code === 'permission-denied' ? 'Kein Zugriff auf diesen Inkassofall.' : 'Der Inkassofall konnte nicht geladen werden.'); setUpdatesLoading(false); setDocumentsLoading(false); setInvoicesLoading(false); setDeadlinesLoading(false); setMovementsLoading(false) } })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false; setTitle('') }
  }, [caseId, editable, setTitle])

  async function saveCase(values) {
    setError('')
    try { const changed = await updateInkassoCaseFields(inkassoCase, values, { user, profile }); if (changed) { await load(); setToast('Fallinformationen gespeichert.') } } catch (saveError) { setError(saveError.message || 'Die Änderung konnte nicht gespeichert werden.'); throw saveError }
  }

  async function saveNote(event) {
    event.preventDefault(); setNoteSaving(true); setError('')
    try { await addInkassoCaseUpdate(inkassoCase, note, { user, profile }); setNote(''); await load(); setToast('Update hinzugefügt.') } catch (saveError) { setError(saveError.message || 'Das Update konnte nicht gespeichert werden.') } finally { setNoteSaving(false) }
  }

  async function saveDocument(values, file) {
    setDocumentSaving(true); setError('')
    try {
      const existing = editingDocument === 'new' ? null : editingDocument
      const actorName = getUserDisplayName(profile, user)
      if (existing) await updateInkassoCaseDocument(inkassoCase.id, existing, values)
      else await createInkassoCaseDocument(inkassoCase.id, values, file, { id: user?.uid, name: actorName })
      await load(); setEditingDocument(null); setToast(existing ? 'Dokument aktualisiert.' : 'Dokument hochgeladen.')
    } catch (saveError) { setError(getDocumentErrorMessage(saveError)); throw saveError } finally { setDocumentSaving(false) }
  }

  async function deleteDocument(documentItem) {
    setDocumentSaving(true); setError('')
    try { await deleteInkassoCaseDocument(inkassoCase.id, documentItem); await load(); setDocumentConfirmation(null); setToast('Dokument dauerhaft gelöscht.') } catch (deleteError) { setError(getDocumentErrorMessage(deleteError)); throw deleteError } finally { setDocumentSaving(false) }
  }

  async function saveMovement(existingMovement, values) {
    setError('')
    try { if (existingMovement) await updateInkassoCaseMovement(inkassoCase, existingMovement, values, { user, profile }); else await createInkassoCaseMovement(inkassoCase, values, { user, profile }); await load(); setToast(existingMovement ? 'Betragsbewegung aktualisiert.' : 'Betragsbewegung hinzugefügt.') } catch (saveError) { setError(saveError.message || 'Die Betragsbewegung konnte nicht gespeichert werden.'); throw saveError }
  }

  async function deleteMovement(movement) {
    setError('')
    try { await deleteInkassoCaseMovement(inkassoCase, movement, { user, profile }); await load(); setToast('Betragsbewegung gelöscht.') } catch (deleteError) { setError(deleteError.message || 'Die Betragsbewegung konnte nicht gelöscht werden.'); throw deleteError }
  }

  async function changeInvoicePayment(invoice, isPaid) {
    setSavingInvoiceId(invoice.id); setError('')
    try { await updateInkassoInvoicePayment(inkassoCase, invoice, isPaid, { user, profile }); await load(); setToast(isPaid ? 'Rechnung als bezahlt markiert.' : 'Zahlungsstatus zurückgesetzt.') } catch (saveError) { setError(saveError.message || 'Der Zahlungsstatus konnte nicht geändert werden.') } finally { setSavingInvoiceId('') }
  }

  async function saveInvoice(existingInvoice, values) {
    setError('')
    try { if (existingInvoice) await updateInkassoCaseInvoice(inkassoCase, existingInvoice, values, { user, profile }); else await createInkassoCaseInvoice(inkassoCase, values, { user, profile }); await load(); setToast(existingInvoice ? 'Rechnung aktualisiert.' : 'Rechnung hinzugefügt.') } catch (saveError) { setError(saveError.message || 'Die Rechnung konnte nicht gespeichert werden.'); throw saveError }
  }

  async function saveDeadline(existingDeadline, values) {
    setError('')
    try { if (existingDeadline) await updateInkassoCaseDeadline(inkassoCase, existingDeadline, values, { user, profile }); else await createInkassoCaseDeadline(inkassoCase, values, { user, profile }); await load(); setToast(existingDeadline ? 'Termin aktualisiert.' : 'Termin hinzugefügt.') } catch (saveError) { setError(saveError.message || 'Der Termin konnte nicht gespeichert werden.'); throw saveError }
  }

  async function deleteDeadline(deadline) {
    setError('')
    try { await deleteInkassoCaseDeadline(inkassoCase, deadline, { user, profile }); await load(); setToast('Termin gelöscht.') } catch (deleteError) { setError(deleteError.message || 'Der Termin konnte nicht gelöscht werden.'); throw deleteError }
  }

  if (loading) return <p className="page-state">Inkassofall wird geladen …</p>
  if (error && !inkassoCase) return <section className="damage-detail-empty"><h2>Inkassofall nicht verfügbar</h2><p>{error}</p><BackLink to="/inkasso" /></section>
  if (!inkassoCase) return null
  const todoFixedLink = { field: 'inkassoCaseId', id: inkassoCase.id, label: 'Inkassofall', value: [inkassoCase.caseNumber, inkassoCase.debtorName].filter(Boolean).join(' · ') || 'Inkassofall', values: { carrierId: inkassoCase.debtorPartnerId || '', carrierName: inkassoCase.debtorName || '' } }

  const manualUpdates = updates.filter((update) => update.type === 'note')
  const history = [...updates.filter((update) => update.type === 'system'), ...historyEntries].sort((left, right) => (right.createdAt?.seconds || 0) - (left.createdAt?.seconds || 0))
  const title = [inkassoCase.caseNumber || 'Inkassofall', inkassoCase.debtorName].filter(Boolean).join(' – ')
  const allInformationValues = [inkassoCase.caseNumber, inkassoCase.completedAt]

  return <>
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    {detailsDocument && <DocumentDetailsModal documentItem={detailsDocument} onClose={() => setDetailsDocument(null)} />}
    <ConfirmDialog open={Boolean(documentConfirmation)} title="Dokument dauerhaft löschen?" message="Dieses Dokument wird dauerhaft gelöscht und kann nicht wiederhergestellt werden." confirmLabel="Endgültig löschen" submittingLabel="Wird gelöscht …" variant="danger" isSubmitting={documentSaving} onCancel={() => setDocumentConfirmation(null)} onConfirm={() => deleteDocument(documentConfirmation)} />
    {editingDocument && <div className="document-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !documentSaving) setEditingDocument(null) }}><section className="document-modal" role="dialog" aria-modal="true" aria-label={editingDocument === 'new' ? 'Dokument hochladen' : 'Dokument bearbeiten'}><DocumentForm key={editingDocument === 'new' ? 'new' : editingDocument.id} documentItem={editingDocument === 'new' ? null : editingDocument} hideExpirationDate onCancel={() => setEditingDocument(null)} onSubmit={saveDocument} /></section></div>}
    {showTodoCreate && <LinkedTodoCreateModal currentUserId={user.uid} fixedLink={todoFixedLink} partners={todoPartners} users={todoUsers} onCancel={() => setShowTodoCreate(false)} onSubmit={async (values) => { await createLinkedTodo(values); setShowTodoCreate(false); setToast('To-do angelegt.') }} />}
    {editing && <InkassoCaseEditModal inkassoCase={inkassoCase} mode={editing} onCancel={() => setEditing(null)} onSubmit={saveCase} />}
    <div className="todo-detail-navigation damage-detail-navigation"><BackLink to="/inkasso" /></div>
    <div className="todo-detail-page damage-detail-page inkasso-detail-page">
      <header className="todo-detail-header"><div className="todo-detail-header__title"><h2>{title}</h2></div><span className={`todo-status damage-status damage-status--${inkassoCase.status}`}>{inkassoCaseStatusLabel(inkassoCase.status)}</span></header>
      {error && <p className="form-error">{error}</p>}
      <div className="todo-detail-layout">
        <main className="todo-detail-main">
          <section className="todo-detail-content"><div className="todo-detail-section-heading"><h3>Beschreibung</h3>{editable && <button className="todo-detail-section-edit" type="button" onClick={() => setEditing('description')} aria-label="Beschreibung bearbeiten" title="Beschreibung bearbeiten"><EditIcon size={14} /></button>}</div><p className="todo-detail-description">{inkassoCase.description || 'Keine Beschreibung hinterlegt.'}</p></section>
          <InkassoDeadlinesCard canEdit={editable} deadlines={deadlines} loading={deadlinesLoading} onDelete={deleteDeadline} onSave={saveDeadline} />
          {canViewTodos && <LinkedTodosCard canCreate={canCreateTodos} loading={linkedTodoLoading} onCreate={() => setShowTodoCreate(true)} todos={linkedTodos} />}
          <DamageDocumentsCard canEdit={editable} documents={documents} getDocumentBlob={getInkassoCaseDocumentBlob} loading={documentsLoading} onDelete={setDocumentConfirmation} onDetails={setDetailsDocument} onEdit={setEditingDocument} onUpload={() => setEditingDocument('new')} />
          <InkassoInvoicesCard canEdit={editable} invoices={invoices} loading={invoicesLoading} movements={movements} movementsLoading={movementsLoading} onDeleteMovement={deleteMovement} onPaymentChange={changeInvoicePayment} onSave={saveInvoice} onSaveMovement={saveMovement} savingInvoiceId={savingInvoiceId} />
          {(editable || updatesLoading || manualUpdates.length > 0) && <section className="todo-updates damage-case-updates" aria-labelledby="inkasso-update-title"><div className="todo-updates__heading"><h3 id="inkasso-update-title">Updates</h3>{manualUpdates.length > 0 && <span>{manualUpdates.length}</span>}</div>{editable && <form className="todo-updates__form" onSubmit={saveNote}><textarea aria-label="Update zum Inkassofall" rows="2" value={note} maxLength="1000" onChange={(event) => setNote(event.target.value)} placeholder="Update zum Inkassofall hinzufügen …" /><button className="button" type="submit" disabled={noteSaving || !note.trim()}>{noteSaving ? 'Wird gespeichert …' : 'Update hinzufügen'}</button></form>}{updatesLoading ? <p className="todo-updates__empty">Updates werden geladen …</p> : !manualUpdates.length ? <p className="todo-updates__empty">Noch keine Updates zum Inkassofall.</p> : <ol className="todo-updates__list">{manualUpdates.map((update) => <li key={update.id} className="todo-updates__item todo-updates__item--note"><div><strong>{update.createdByName}</strong><span>Update · {formatTimestamp(update.createdAt)}</span></div><p>{update.text}</p></li>)}</ol>}</section>}
          <section className="todo-updates todo-history" aria-labelledby="inkasso-history-title"><div className="todo-updates__heading"><h3 id="inkasso-history-title">Historie</h3><span>{history.length}</span></div>{updatesLoading ? <p className="todo-updates__empty">Historie wird geladen …</p> : !history.length ? <p className="todo-updates__empty">Noch keine Historieneinträge.</p> : <ol className="todo-updates__list">{history.map((update) => <li key={update.id} className="todo-updates__item todo-updates__item--system"><div><strong>{update.createdByName}</strong><span>System · {formatTimestamp(update.createdAt)}</span></div><p>{update.text}</p></li>)}</ol>}</section>
        </main>
        <aside className="todo-detail-sidebar">
          <InformationSection title="Allgemein" values={allInformationValues}><Detail label="Interne Fallnummer">{inkassoCase.caseNumber}</Detail>{inkassoCase.completedAt && <Detail label="Abgeschlossen am">{formatTimestamp(inkassoCase.completedAt)}</Detail>}</InformationSection>
          <InformationSection title="Inkassodaten" values={[inkassoCase.collectionAgency, inkassoCase.collectionReference, inkassoCase.createdAt]} onEdit={editable ? () => setEditing('collection') : null}><Detail label="Inkassounternehmen">{inkassoCase.collectionAgency}</Detail><Detail label="Aktenzeichen">{inkassoCase.collectionReference}</Detail><Detail label="Inkasso eröffnet am">{formatTimestamp(inkassoCase.createdAt)}</Detail></InformationSection>
          <InformationSection title="Unternehmer" values={[inkassoCase.debtorName]}><Detail label="Unternehmen">{inkassoCase.debtorName}</Detail></InformationSection>
          <InformationSection title="Systemdaten" values={[inkassoCase.createdByName, inkassoCase.createdAt, inkassoCase.updatedByName, inkassoCase.updatedAt]}><Detail label="Erstellt von">{inkassoCase.createdByName}</Detail><Detail label="Erstellt am">{formatTimestamp(inkassoCase.createdAt)}</Detail><Detail label="Zuletzt geändert von">{inkassoCase.updatedByName}</Detail><Detail label="Zuletzt geändert am">{formatTimestamp(inkassoCase.updatedAt)}</Detail></InformationSection>
        </aside>
      </div>
    </div>
  </>
}
