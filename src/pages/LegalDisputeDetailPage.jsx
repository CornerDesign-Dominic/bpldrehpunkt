import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import DamageDocumentsCard from '../components/damages/DamageDocumentsCard.jsx'
import LegalDisputeFinancialOverview from '../components/legal-disputes/LegalDisputeFinancialOverview.jsx'
import LegalDisputeEditModal from '../components/legal-disputes/LegalDisputeEditModal.jsx'
import DocumentDetailsModal from '../components/documents/DocumentDetailsModal.jsx'
import DocumentForm from '../components/documents/DocumentForm.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import Toast from '../components/ui/Toast.jsx'
import { EditIcon } from '../components/icons.jsx'
import { useAuth } from '../auth/useAuth.js'
import { usePermissions } from '../auth/usePermissions.js'
import { getDocumentErrorMessage } from '../lib/documents.js'
import { createLegalDisputeDocument, deleteLegalDisputeDocument, getLegalDisputeDocumentBlob, listLegalDisputeDocuments, updateLegalDisputeDocument } from '../lib/legalDisputeDocuments.js'
import { addLegalDisputeSystemUpdate, addLegalDisputeUpdate, getLegalDispute, legalDisputeStatusLabel, listLegalDisputeUpdates, updateLegalDisputeFields } from '../lib/legalDisputes.js'
import { usePageHeader } from '../lib/pageHeader.js'
import { getUserDisplayName } from '../lib/userProfiles.js'

function formatDate(value) { return value ? new Intl.DateTimeFormat('de-DE').format(new Date(`${value}T12:00:00`)) : '—' }
function formatTimestamp(value) { const date = value?.toDate?.(); return date ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : '—' }
function hasValue(value) { return value !== null && value !== undefined && value !== '' }

function Detail({ label, children }) { return <div><dt>{label}</dt><dd>{children || '—'}</dd></div> }

function InformationSection({ title, children, onEdit, values }) {
  if (!values.some(hasValue)) return null
  return <section><div className="todo-detail-section-heading"><h3>{title}</h3>{onEdit && <button className="todo-detail-section-edit" type="button" onClick={onEdit} title={`${title} bearbeiten`} aria-label={`${title} bearbeiten`}><EditIcon size={14} /></button>}</div><dl>{children}</dl></section>
}

export default function LegalDisputeDetailPage() {
  const { legalDisputeId } = useParams()
  const { user, profile } = useAuth()
  const { canEdit } = usePermissions()
  const { setTitle } = usePageHeader()
  const editable = canEdit('legalDisputes')
  const [legalDispute, setLegalDispute] = useState(null)
  const [documents, setDocuments] = useState([])
  const [updates, setUpdates] = useState([])
  const [loading, setLoading] = useState(true)
  const [documentsLoading, setDocumentsLoading] = useState(true)
  const [updatesLoading, setUpdatesLoading] = useState(true)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const [documentSaving, setDocumentSaving] = useState(false)
  const [editingDocument, setEditingDocument] = useState(null)
  const [detailsDocument, setDetailsDocument] = useState(null)
  const [documentConfirmation, setDocumentConfirmation] = useState(null)
  const [editing, setEditing] = useState(null)
  const [toast, setToast] = useState('')

  async function load() {
    const [entry, entries, caseDocuments] = await Promise.all([getLegalDispute(legalDisputeId), listLegalDisputeUpdates(legalDisputeId), listLegalDisputeDocuments(legalDisputeId)])
    setLegalDispute(entry)
    setUpdates(entries)
    setDocuments(caseDocuments)
    setTitle(entry?.caseNumber || '')
    setDocumentsLoading(false)
    setUpdatesLoading(false)
  }

  useEffect(() => {
    let current = true
    Promise.all([getLegalDispute(legalDisputeId), listLegalDisputeUpdates(legalDisputeId), listLegalDisputeDocuments(legalDisputeId)])
      .then(([entry, entries, caseDocuments]) => { if (current) { setLegalDispute(entry); setUpdates(entries); setDocuments(caseDocuments); setTitle(entry?.caseNumber || ''); setDocumentsLoading(false); setUpdatesLoading(false) } })
      .catch((loadError) => { if (current) { setError(loadError.code === 'permission-denied' ? 'Kein Zugriff auf diesen Fall.' : 'Der Fall konnte nicht geladen werden.'); setDocumentsLoading(false); setUpdatesLoading(false) } })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false; setTitle('') }
  }, [legalDisputeId, setTitle])

  async function saveNote(event) {
    event.preventDefault()
    setNoteSaving(true)
    setError('')
    try { await addLegalDisputeUpdate(legalDispute, note, { user, profile }); setNote(''); await load(); setToast('Update hinzugefügt.') } catch (saveError) { setError(saveError.message || 'Das Update konnte nicht gespeichert werden.') } finally { setNoteSaving(false) }
  }

  async function saveDocument(values, file) {
    setDocumentSaving(true)
    setError('')
    try {
      const existing = editingDocument === 'new' ? null : editingDocument
      const title = (values.title || existing?.title || file?.name || 'Unbenanntes Dokument').trim()
      const actorName = getUserDisplayName(profile, user) || 'Ein Nutzer'
      if (existing) {
        await updateLegalDisputeDocument(legalDispute.id, existing, values)
        await addLegalDisputeSystemUpdate(legalDispute, `${actorName} hat die Dokumentdetails von „${title}“ bearbeitet.`, { user, profile })
      } else {
        await createLegalDisputeDocument(legalDispute.id, values, file, { id: user?.uid, name: actorName })
        await addLegalDisputeSystemUpdate(legalDispute, `${actorName} hat das Dokument „${title}“ hochgeladen.`, { user, profile })
      }
      await load(); setEditingDocument(null); setToast(existing ? 'Dokument aktualisiert.' : 'Dokument hochgeladen.')
    } catch (saveError) { setError(getDocumentErrorMessage(saveError)); throw saveError } finally { setDocumentSaving(false) }
  }

  async function deleteDocument(documentItem) {
    setDocumentSaving(true)
    setError('')
    try {
      await deleteLegalDisputeDocument(legalDispute.id, documentItem)
      await addLegalDisputeSystemUpdate(legalDispute, `${getUserDisplayName(profile, user) || 'Ein Nutzer'} hat das Dokument „${documentItem.title || documentItem.fileName || 'Unbenanntes Dokument'}“ gelöscht.`, { user, profile })
      await load(); setDocumentConfirmation(null); setToast('Dokument dauerhaft gelöscht.')
    } catch (deleteError) { setError(getDocumentErrorMessage(deleteError)); throw deleteError } finally { setDocumentSaving(false) }
  }

  async function saveSection(values) {
    const changes = editing === 'financial'
      ? Object.fromEntries(Object.entries(values).map(([field, value]) => [field, value === '' ? null : Number(value)]))
      : values
    const systemText = { description: 'Sachverhalt aktualisiert', financial: 'Finanzieller Überblick aktualisiert', information: 'Fallinformationen aktualisiert' }[editing]
    try { await updateLegalDisputeFields(legalDispute, changes, { user, profile }, systemText); await load(); setEditing(null); setToast('Änderung gespeichert.') } catch (saveError) { setError(saveError.message || 'Die Änderung konnte nicht gespeichert werden.'); throw saveError }
  }

  if (loading) return <p className="page-state">Fall wird geladen …</p>
  if (error && !legalDispute) return <section className="damage-detail-empty"><h2>Fall nicht verfügbar</h2><p>{error}</p><Link className="button button--secondary" to="/legal-disputes">Zurück</Link></section>
  if (!legalDispute) return null

  const manualUpdates = updates.filter((update) => update.type === 'note')
  const history = updates.filter((update) => update.type === 'system')
  const title = `${legalDispute.caseNumber || legalDispute.reference || 'Fall'} – ${legalDispute.title || legalDispute.subject || 'Ohne Betreff'}`
  const nextDeadline = legalDispute.nextDeadline ? `${formatDate(legalDispute.nextDeadline)}${legalDispute.nextDeadlineLabel ? ` · ${legalDispute.nextDeadlineLabel}` : ''}` : ''
  const nextHearing = legalDispute.nextHearing ? `${formatDate(legalDispute.nextHearing)}${legalDispute.nextHearingTime ? ` · ${legalDispute.nextHearingTime}` : ''}` : ''

  return <>
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    {detailsDocument && <DocumentDetailsModal documentItem={detailsDocument} onClose={() => setDetailsDocument(null)} />}
    <ConfirmDialog open={Boolean(documentConfirmation)} title="Dokument dauerhaft löschen?" message="Dieses Dokument wird dauerhaft gelöscht und kann nicht wiederhergestellt werden." confirmLabel="Endgültig löschen" submittingLabel="Wird gelöscht …" variant="danger" isSubmitting={documentSaving} onCancel={() => setDocumentConfirmation(null)} onConfirm={() => deleteDocument(documentConfirmation)} />
    {editingDocument && <div className="document-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !documentSaving) setEditingDocument(null) }}><section className="document-modal" role="dialog" aria-modal="true" aria-label={editingDocument === 'new' ? 'Dokument hochladen' : 'Dokument bearbeiten'}><DocumentForm key={editingDocument === 'new' ? 'new' : editingDocument.id} documentItem={editingDocument === 'new' ? null : editingDocument} hideExpirationDate onCancel={() => setEditingDocument(null)} onSubmit={saveDocument} /></section></div>}
    {editing && <LegalDisputeEditModal key={editing} legalDispute={legalDispute} section={editing} onCancel={() => setEditing(null)} onSubmit={saveSection} />}
    <div className="todo-detail-navigation"><Link className="button button--secondary" to="/legal-disputes">← Zur Gericht-/Streit-Übersicht</Link></div>
    <div className="todo-detail-page damage-detail-page legal-dispute-detail-page">
      <header className="todo-detail-header"><div className="todo-detail-header__title"><h2>{title}</h2></div><div className="legal-dispute-detail-page__header-meta"><span className={`todo-status damage-status damage-status--${legalDispute.status}`}>{legalDisputeStatusLabel(legalDispute.status)}</span>{legalDispute.caseType && <span className="todo-status">{legalDispute.caseType}</span>}</div></header>
      {error && <p className="form-error">{error}</p>}
      <div className="todo-detail-layout">
        <main className="todo-detail-main">
          <section className="todo-detail-content"><div className="todo-detail-section-heading"><h3>Sachverhalt</h3>{editable && <button className="todo-detail-section-edit" type="button" onClick={() => setEditing('description')} title="Sachverhalt bearbeiten" aria-label="Sachverhalt bearbeiten"><EditIcon size={14} /></button>}</div><p className="todo-detail-description">{legalDispute.description || 'Kein Sachverhalt hinterlegt.'}</p></section>
          <DamageDocumentsCard canEdit={editable} documents={documents} getDocumentBlob={getLegalDisputeDocumentBlob} loading={documentsLoading} onDelete={setDocumentConfirmation} onDetails={setDetailsDocument} onEdit={setEditingDocument} onUpload={() => setEditingDocument('new')} />
          <LegalDisputeFinancialOverview canEdit={editable} legalDispute={legalDispute} onEdit={() => setEditing('financial')} />
          {(editable || updatesLoading || manualUpdates.length > 0) && <section className="todo-updates damage-case-updates" aria-labelledby="legal-dispute-update-title"><div className="todo-updates__heading"><h3 id="legal-dispute-update-title">Updates</h3>{manualUpdates.length > 0 && <span>{manualUpdates.length}</span>}</div>{editable && <form className="todo-updates__form" onSubmit={saveNote}><textarea aria-label="Update zum Fall" rows="2" value={note} maxLength="1000" onChange={(event) => setNote(event.target.value)} placeholder="Update zum Fall hinzufügen …" /><button className="button" type="submit" disabled={noteSaving || !note.trim()}>{noteSaving ? 'Wird gespeichert …' : 'Update hinzufügen'}</button></form>}{updatesLoading ? <p className="todo-updates__empty">Updates werden geladen …</p> : !manualUpdates.length && <p className="todo-updates__empty">Noch keine Updates zum Fall.</p>}{manualUpdates.length > 0 && <ol className="todo-updates__list">{manualUpdates.map((update) => <li key={update.id} className="todo-updates__item todo-updates__item--note"><div><strong>{update.createdByName}</strong><span>Update · {formatTimestamp(update.createdAt)}</span></div><p>{update.text}</p></li>)}</ol>}</section>}
          <section className="todo-updates todo-history" aria-labelledby="legal-dispute-history-title"><div className="todo-updates__heading"><h3 id="legal-dispute-history-title">Historie</h3><span>{history.length}</span></div>{updatesLoading ? <p className="todo-updates__empty">Historie wird geladen …</p> : !history.length ? <p className="todo-updates__empty">Noch keine Historieneinträge.</p> : <ol className="todo-updates__list">{history.map((update) => <li key={update.id} className="todo-updates__item todo-updates__item--system"><div><strong>{update.createdByName}</strong><span>System · {formatTimestamp(update.createdAt)}</span></div><p>{update.text}</p></li>)}</ol>}</section>
        </main>
        <aside className="todo-detail-sidebar">
          <InformationSection title="Fallinformationen" onEdit={editable ? () => setEditing('information') : null} values={[legalDispute.caseNumber, legalDispute.status, legalDispute.caseType, legalDispute.responsibleUserName, legalDispute.createdAt, legalDispute.completedAt]}><Detail label="Interne Fallnummer">{legalDispute.caseNumber}</Detail><Detail label="Status">{legalDisputeStatusLabel(legalDispute.status)}</Detail><Detail label="Art des Falls">{legalDispute.caseType}</Detail><Detail label="Zuständig">{legalDispute.responsibleUserName}</Detail><Detail label="Angelegt am">{formatTimestamp(legalDispute.createdAt)}</Detail>{legalDispute.isClosed && <Detail label="Abgeschlossen am">{formatTimestamp(legalDispute.completedAt)}</Detail>}</InformationSection>
          <InformationSection title="Nächste Termine & Fristen" values={[nextDeadline, nextHearing]}>{nextDeadline && <Detail label="Nächste Frist"><span className="due-date due-date--soon">{nextDeadline}</span></Detail>}{nextHearing && <Detail label="Nächster Termin">{nextHearing}</Detail>}</InformationSection>
          <InformationSection title="Beteiligte" values={[legalDispute.participant, legalDispute.counterparty, legalDispute.opposingCounsel]}><Detail label="Beteiligter">{legalDispute.participant}</Detail><Detail label="Gegner">{legalDispute.counterparty}</Detail><Detail label="Gegnerischer Rechtsanwalt">{legalDispute.opposingCounsel}</Detail></InformationSection>
          <InformationSection title="Eigener Rechtsanwalt" values={[legalDispute.lawFirm, legalDispute.ownCounsel, legalDispute.lawyerReference, legalDispute.lawyerPhone, legalDispute.lawyerEmail]}><Detail label="Kanzlei">{legalDispute.lawFirm}</Detail><Detail label="Ansprechpartner">{legalDispute.ownCounsel}</Detail><Detail label="Aktenzeichen">{legalDispute.lawyerReference}</Detail><Detail label="Telefon">{legalDispute.lawyerPhone}</Detail><Detail label="E-Mail">{legalDispute.lawyerEmail}</Detail></InformationSection>
          <InformationSection title="Gericht" values={[legalDispute.court, legalDispute.courtReference, legalDispute.judgeOrChamber]}><Detail label="Gericht">{legalDispute.court}</Detail><Detail label="Gerichtliches Aktenzeichen">{legalDispute.courtReference}</Detail><Detail label="Richter / Kammer">{legalDispute.judgeOrChamber}</Detail></InformationSection>
          <InformationSection title="Verfahren" values={[legalDispute.procedureType, legalDispute.proceedingStage, legalDispute.instance, legalDispute.startedAt]}><Detail label="Verfahrensart">{legalDispute.procedureType}</Detail><Detail label="Außergerichtlich / gerichtlich">{legalDispute.proceedingStage}</Detail><Detail label="Instanz">{legalDispute.instance}</Detail><Detail label="Beginn des Falls">{formatDate(legalDispute.startedAt)}</Detail></InformationSection>
        </aside>
      </div>
    </div>
  </>
}
