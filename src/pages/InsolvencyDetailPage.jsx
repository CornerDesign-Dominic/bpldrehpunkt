import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import DamageDocumentsCard from '../components/damages/DamageDocumentsCard.jsx'
import DocumentDetailsModal from '../components/documents/DocumentDetailsModal.jsx'
import DocumentForm from '../components/documents/DocumentForm.jsx'
import InsolvencyEditModal from '../components/insolvencies/InsolvencyEditModal.jsx'
import InsolvencyClaimsOverview from '../components/insolvencies/InsolvencyClaimsOverview.jsx'
import InsolvencyDeadlinesCard from '../components/insolvencies/InsolvencyDeadlinesCard.jsx'
import LinkedTodoCreateModal from '../components/todos/LinkedTodoCreateModal.jsx'
import LinkedTodosCard from '../components/todos/LinkedTodosCard.jsx'
import { EditIcon } from '../components/icons.jsx'
import BackLink from '../components/ui/BackLink.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import Toast from '../components/ui/Toast.jsx'
import { useAuth } from '../auth/useAuth.js'
import { usePermissions } from '../auth/usePermissions.js'
import { getDocumentErrorMessage } from '../lib/documents.js'
import { createInsolvencyDocument, deleteInsolvencyDocument, getInsolvencyDocumentBlob, listInsolvencyDocuments, updateInsolvencyDocument } from '../lib/insolvencyDocuments.js'
import { createInsolvencyClaim, createInsolvencyDeadline, createInsolvencyQuotaPayment, deleteInsolvencyClaim, deleteInsolvencyDeadline, deleteInsolvencyQuotaPayment, getInsolvency, insolvencyDeadlinePresentation, listInsolvencyClaims, listInsolvencyDeadlines, listInsolvencyQuotaPayments, listInsolvencyUpdates, updateInsolvency, updateInsolvencyClaim, updateInsolvencyDeadline, updateInsolvencyDescription, updateInsolvencyQuotaPayment } from '../lib/insolvencies.js'
import { getUserDisplayName } from '../lib/userProfiles.js'
import { useLinkedTodos } from '../components/todos/useLinkedTodos.js'

function formatDate(value) { return value ? new Intl.DateTimeFormat('de-DE').format(new Date(`${value}T12:00:00`)) : '—' }
function formatTimestamp(value) { const date = value?.toDate?.(); return date ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : '—' }
function Detail({ label, children }) { return <div><dt>{label}</dt><dd>{children || '—'}</dd></div> }
function deadlineClass(deadline) {
  const kind = insolvencyDeadlinePresentation(deadline).kind
  return kind === 'overdue' ? 'damage-deadlines__date damage-deadlines__date--overdue' : kind === 'today' ? 'damage-deadlines__date damage-deadlines__date--today' : kind === 'urgent' ? 'damage-deadlines__date damage-deadlines__date--urgent' : kind === 'warning' ? 'damage-deadlines__date damage-deadlines__date--warning' : 'damage-deadlines__date'
}

export default function InsolvencyDetailPage() {
  const { partnerId } = useParams()
  const { user, profile } = useAuth()
  const { canEdit, canView } = usePermissions()
  const editable = canEdit('insolvencies')
  const canViewMasterData = canView('masterData')
  const canCreateTodos = canEdit('todos')
  const canViewTodos = canView('todos')
  const [insolvency, setInsolvency] = useState(null)
  const [documents, setDocuments] = useState([])
  const [claims, setClaims] = useState([])
  const [quotaPayments, setQuotaPayments] = useState([])
  const [deadlines, setDeadlines] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [documentsLoading, setDocumentsLoading] = useState(true)
  const [financialLoading, setFinancialLoading] = useState(true)
  const [deadlinesLoading, setDeadlinesLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [editingDocument, setEditingDocument] = useState(null)
  const [detailsDocument, setDetailsDocument] = useState(null)
  const [documentConfirmation, setDocumentConfirmation] = useState(null)
  const [documentSaving, setDocumentSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [showTodoCreate, setShowTodoCreate] = useState(false)
  const { createLinkedTodo, linkedTodoLoading, linkedTodos, todoPartners, todoUsers } = useLinkedTodos({ canCreate: canCreateTodos, canViewMasterData, canViewTodos, caseField: 'insolvencyId', caseId: partnerId, profile, user })

  async function load() {
    const [entry, entries, insolvencyClaims, insolvencyQuotaPayments, insolvencyDeadlines, insolvencyHistory] = await Promise.all([getInsolvency(partnerId), listInsolvencyDocuments(partnerId), listInsolvencyClaims(partnerId), listInsolvencyQuotaPayments(partnerId), listInsolvencyDeadlines(partnerId), listInsolvencyUpdates(partnerId)])
    if (!entry) throw new Error('Der Insolvenzfall wurde nicht gefunden.')
    setInsolvency(entry)
    setDocuments(entries)
    setClaims(insolvencyClaims)
    setQuotaPayments(insolvencyQuotaPayments)
    setDeadlines(insolvencyDeadlines)
    setHistory(insolvencyHistory)
    setDocumentsLoading(false)
    setFinancialLoading(false)
    setDeadlinesLoading(false)
    setHistoryLoading(false)
  }

  useEffect(() => {
    let current = true
    Promise.all([getInsolvency(partnerId), listInsolvencyDocuments(partnerId), listInsolvencyClaims(partnerId), listInsolvencyQuotaPayments(partnerId), listInsolvencyDeadlines(partnerId), listInsolvencyUpdates(partnerId)])
      .then(([entry, entries, insolvencyClaims, insolvencyQuotaPayments, insolvencyDeadlines, insolvencyHistory]) => {
        if (!entry) throw new Error('Der Insolvenzfall wurde nicht gefunden.')
        if (current) { setInsolvency(entry); setDocuments(entries); setClaims(insolvencyClaims); setQuotaPayments(insolvencyQuotaPayments); setDeadlines(insolvencyDeadlines); setHistory(insolvencyHistory); setDocumentsLoading(false); setFinancialLoading(false); setDeadlinesLoading(false); setHistoryLoading(false) }
      })
      .catch((loadError) => { if (current) { setError(loadError.code === 'permission-denied' ? 'Kein Zugriff auf diesen Insolvenzfall.' : loadError.message || 'Der Insolvenzfall konnte nicht geladen werden.'); setDocumentsLoading(false); setFinancialLoading(false); setDeadlinesLoading(false); setHistoryLoading(false) } })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [partnerId])

  async function saveEdit(values) {
    setError('')
    try {
      const changed = editing === 'description'
        ? await updateInsolvencyDescription(insolvency, values.description, { user, profile })
        : await updateInsolvency(insolvency, values, { user, profile })
      if (changed) { await load(); setToast('Änderung gespeichert.') }
      setEditing(null)
    } catch (saveError) { setError(saveError.message || 'Die Änderung konnte nicht gespeichert werden.'); throw saveError }
  }

  async function saveDocument(values, file) {
    setDocumentSaving(true)
    setError('')
    try {
      const existing = editingDocument === 'new' ? null : editingDocument
      if (existing) await updateInsolvencyDocument(insolvency.id, existing, values)
      else await createInsolvencyDocument(insolvency.id, values, file, { id: user?.uid, name: getUserDisplayName(profile, user) })
      await load()
      setEditingDocument(null)
      setToast(existing ? 'Dokument aktualisiert.' : 'Dokument hochgeladen.')
    } catch (saveError) { setError(getDocumentErrorMessage(saveError)); throw saveError } finally { setDocumentSaving(false) }
  }

  async function deleteDocument(documentItem) {
    setDocumentSaving(true)
    setError('')
    try {
      await deleteInsolvencyDocument(insolvency.id, documentItem)
      await load()
      setDocumentConfirmation(null)
      setToast('Dokument dauerhaft gelöscht.')
    } catch (deleteError) { setError(getDocumentErrorMessage(deleteError)); throw deleteError } finally { setDocumentSaving(false) }
  }

  async function saveClaim(existingClaim, values) {
    setError('')
    try {
      if (existingClaim) await updateInsolvencyClaim(insolvency, existingClaim, values, { user, profile })
      else await createInsolvencyClaim(insolvency, values, { user, profile })
      await load()
      setToast(existingClaim ? 'Rechnung aktualisiert.' : 'Rechnung hinzugefügt.')
    } catch (saveError) { setError(saveError.message || 'Die Rechnung konnte nicht gespeichert werden.'); throw saveError }
  }

  async function deleteClaim(claim) {
    setError('')
    try {
      await deleteInsolvencyClaim(insolvency, claim, { user, profile })
      await load()
      setToast('Rechnung gelöscht.')
    } catch (deleteError) { setError(deleteError.message || 'Die Rechnung konnte nicht gelöscht werden.'); throw deleteError }
  }

  async function saveQuotaPayment(existingPayment, values) {
    setError('')
    try {
      if (existingPayment) await updateInsolvencyQuotaPayment(insolvency, existingPayment, values, { user, profile })
      else await createInsolvencyQuotaPayment(insolvency, values, { user, profile })
      await load()
      setToast(existingPayment ? 'Quotenzahlung aktualisiert.' : 'Quotenzahlung hinzugefügt.')
    } catch (saveError) { setError(saveError.message || 'Die Quotenzahlung konnte nicht gespeichert werden.'); throw saveError }
  }

  async function deleteQuotaPayment(payment) {
    setError('')
    try {
      await deleteInsolvencyQuotaPayment(insolvency, payment, { user, profile })
      await load()
      setToast('Quotenzahlung gelöscht.')
    } catch (deleteError) { setError(deleteError.message || 'Die Quotenzahlung konnte nicht gelöscht werden.'); throw deleteError }
  }

  async function saveDeadline(existingDeadline, values) {
    setError('')
    try {
      const changed = existingDeadline
        ? await updateInsolvencyDeadline(insolvency, existingDeadline, values, { user, profile })
        : await createInsolvencyDeadline(insolvency, values, { user, profile })
      if (changed !== false) {
        await load()
        setToast(existingDeadline ? 'Termin aktualisiert.' : 'Termin hinzugefügt.')
      }
    } catch (saveError) {
      setError(saveError.message || 'Der Termin konnte nicht gespeichert werden.')
      throw saveError
    }
  }

  async function deleteDeadline(deadline) {
    setError('')
    try {
      await deleteInsolvencyDeadline(insolvency, deadline, { user, profile })
      await load()
      setToast('Termin gelöscht.')
    } catch (deleteError) {
      setError(deleteError.message || 'Der Termin konnte nicht gelöscht werden.')
      throw deleteError
    }
  }

  if (loading) return <p className="page-state">Insolvenzfall wird geladen …</p>
  if (error && !insolvency) return <section className="damage-detail-empty"><h2>Insolvenzfall nicht verfügbar</h2><p>{error}</p><BackLink to="/insolvenzen" /></section>
  if (!insolvency) return null
  const insolvencyPartner = todoPartners.find((partner) => partner.id === insolvency.partnerId)
  const todoFixedLink = { field: 'insolvencyId', id: insolvency.id, label: 'Insolvenzfall', value: [insolvency.partnerName, insolvency.courtReference].filter(Boolean).join(' · ') || 'Insolvenzfall', values: insolvencyPartner?.creditorNumber?.trim() ? { carrierId: insolvencyPartner.id, carrierName: insolvencyPartner.companyName } : {} }
  const nextDeadline = deadlines[0] || null

  return <>
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    {detailsDocument && <DocumentDetailsModal documentItem={detailsDocument} onClose={() => setDetailsDocument(null)} />}
    <ConfirmDialog open={Boolean(documentConfirmation)} title="Dokument dauerhaft löschen?" message="Dieses Dokument wird dauerhaft gelöscht und kann nicht wiederhergestellt werden." confirmLabel="Endgültig löschen" submittingLabel="Wird gelöscht …" variant="danger" isSubmitting={documentSaving} onCancel={() => setDocumentConfirmation(null)} onConfirm={() => deleteDocument(documentConfirmation)} />
    {editingDocument && <div className="document-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !documentSaving) setEditingDocument(null) }}><section className="document-modal" role="dialog" aria-modal="true" aria-label={editingDocument === 'new' ? 'Dokument hochladen' : 'Dokument bearbeiten'}><DocumentForm key={editingDocument === 'new' ? 'new' : editingDocument.id} documentItem={editingDocument === 'new' ? null : editingDocument} hideExpirationDate onCancel={() => setEditingDocument(null)} onSubmit={saveDocument} /></section></div>}
    {showTodoCreate && <LinkedTodoCreateModal currentUserId={user.uid} fixedLink={todoFixedLink} partners={todoPartners} users={todoUsers} onCancel={() => setShowTodoCreate(false)} onSubmit={async (values) => { await createLinkedTodo(values); setShowTodoCreate(false); setToast('To-do angelegt.') }} />}
    {editing && <InsolvencyEditModal key={editing} insolvency={insolvency} section={editing} onCancel={() => setEditing(null)} onSubmit={saveEdit} />}
    <div className="todo-detail-navigation damage-detail-navigation"><BackLink to="/insolvenzen" /></div>
    <div className="todo-detail-page damage-detail-page insolvency-detail-page">
      <header className="todo-detail-header"><div className="todo-detail-header__title"><h2>{insolvency.partnerName}</h2></div></header>
      {error && <p className="form-error">{error}</p>}
      <div className="todo-detail-layout">
        <main className="todo-detail-main">
          <section className="todo-detail-content"><div className="todo-detail-section-heading"><h3>Beschreibung</h3>{editable && <button className="todo-detail-section-edit" type="button" onClick={() => setEditing('description')} aria-label="Beschreibung bearbeiten" title="Beschreibung bearbeiten"><EditIcon size={14} /></button>}</div><p className="todo-detail-description">{insolvency.description || 'Keine Beschreibung hinterlegt.'}</p></section>
          <InsolvencyDeadlinesCard canEdit={editable} deadlines={deadlines} loading={deadlinesLoading} onDelete={deleteDeadline} onSave={saveDeadline} />
          {canViewTodos && <LinkedTodosCard canCreate={canCreateTodos} loading={linkedTodoLoading} onCreate={() => setShowTodoCreate(true)} todos={linkedTodos} />}
          <DamageDocumentsCard canEdit={editable} documents={documents} getDocumentBlob={getInsolvencyDocumentBlob} loading={documentsLoading} onDelete={setDocumentConfirmation} onDetails={setDetailsDocument} onEdit={setEditingDocument} onUpload={() => setEditingDocument('new')} />
          <InsolvencyClaimsOverview canEdit={editable} claims={claims} quotaPayments={quotaPayments} loading={financialLoading} onDeleteClaim={deleteClaim} onDeleteQuotaPayment={deleteQuotaPayment} onSaveClaim={saveClaim} onSaveQuotaPayment={saveQuotaPayment} />
          <section className="todo-updates todo-history" aria-labelledby="insolvency-history-title"><div className="todo-updates__heading"><h3 id="insolvency-history-title">Historie</h3><span>{history.length}</span></div>{historyLoading ? <p className="todo-updates__empty">Historie wird geladen …</p> : history.length ? <ol className="todo-updates__list">{history.map((entry) => <li key={entry.id} className="todo-updates__item todo-updates__item--system"><div><strong>{entry.createdByName}</strong><span>System · {formatTimestamp(entry.createdAt)}</span></div><p>{entry.text}</p></li>)}</ol> : <p className="todo-updates__empty">Noch keine Historieneinträge.</p>}</section>
        </main>
        <aside className="todo-detail-sidebar"><section><div className="todo-detail-section-heading"><h3>Allgemein</h3>{editable && <button className="todo-detail-section-edit" type="button" onClick={() => setEditing('general')} aria-label="Allgemeine Falldaten bearbeiten" title="Allgemeine Falldaten bearbeiten"><EditIcon size={14} /></button>}</div><dl><Detail label="Unternehmen">{canViewMasterData ? <Link to={`/kunden-unternehmer/${insolvency.partnerId}`}>{insolvency.partnerName}</Link> : insolvency.partnerName}</Detail><Detail label="Bekannt geworden am">{formatDate(insolvency.knownDate)}</Detail><Detail label="Nächste Frist">{nextDeadline ? <span className={deadlineClass(nextDeadline)}>{insolvencyDeadlinePresentation(nextDeadline).label} · {formatDate(nextDeadline.date)}</span> : '—'}</Detail></dl></section><section><div className="todo-detail-section-heading"><h3>Gerichtliche Angaben</h3>{editable && <button className="todo-detail-section-edit" type="button" onClick={() => setEditing('general')} aria-label="Gerichtliche Angaben bearbeiten" title="Gerichtliche Angaben bearbeiten"><EditIcon size={14} /></button>}</div><dl><Detail label="Insolvenzeröffnung">{formatDate(insolvency.insolvencyDate)}</Detail><Detail label="Aktenzeichen Gericht">{insolvency.courtReference}</Detail><Detail label="Gerichtsstand">{insolvency.courtVenue}</Detail></dl></section><section className="todo-detail-system"><div className="todo-detail-section-heading"><h3>Systemdaten</h3></div><dl><Detail label="Angelegt am">{formatTimestamp(insolvency.createdAt)}</Detail><Detail label="Geändert am">{formatTimestamp(insolvency.updatedAt)}</Detail></dl></section></aside>
      </div>
    </div>
  </>
}
