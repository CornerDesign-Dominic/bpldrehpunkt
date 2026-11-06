import { useCallback, useEffect, useRef, useState } from 'react'
import { useLanguage } from '../../i18n/useLanguage.js'
import { useAuth } from '../../auth/useAuth.js'
import { createDocumentUploadAttempt, deleteContractDocument, discardContractDocumentUpload, getContractDocumentBlob, listContractDocuments, recoverContractDocument, updateContractDocument, uploadContractDocument } from '../../lib/contractDocuments.js'
import { getPdfFileError } from '../../lib/documents.js'
import { reportTechnicalFailure } from '../../lib/diagnostics.js'
import DamageDocumentsCard from '../damages/DamageDocumentsCard.jsx'
import DocumentDetailsModal from '../documents/DocumentDetailsModal.jsx'
import ConfirmDialog from '../ui/ConfirmDialog.jsx'

function documentError(error, text) {
  if (error?.details?.reason === 'upload-missing') return text('Der Upload ist unvollständig: Es wurde keine PDF gespeichert. Entferne den unvollständigen Upload und wähle die Datei beim erneuten Hinzufügen aus.', 'The upload is incomplete: no PDF was saved. Remove the incomplete upload, then select the file when adding it again.')
  if (error?.details?.reason === 'upload-mismatch') return text('Die gespeicherte Datei passt nicht zu den Uploadangaben. Entferne den unvollständigen Upload und lade die PDF erneut hoch.', 'The stored file does not match the upload details. Remove the incomplete upload and upload the PDF again.')
  const code = String(error?.code || '').split('/').at(-1)
  if (code === 'aborted') return text('Das Dokument wurde inzwischen geändert. Bitte Formular schließen, Dokumente neu laden und die Änderung erneut erfassen.', 'This document has changed. Close this form, reload the documents and enter your change again.')
  if (code === 'permission-denied' || code === 'unauthorized') return text('Keine Berechtigung für diese Dokumentaktion. Bitte die Zugriffsrechte prüfen.', 'You do not have permission for this action. Check your access rights.')
  if (code === 'failed-precondition') return text('Der Dokumentstatus hat sich geändert oder der Upload ist unvollständig. Bitte erneut versuchen oder die Dokumente neu laden.', 'The document status changed or the upload is incomplete. Retry or reload the documents.')
  return text('Die Aktion konnte nicht bestätigt werden. Bitte Verbindung prüfen und erneut versuchen. Wiederholen verwendet denselben Vorgang.', 'The action could not be confirmed. Check your connection and retry. Retrying uses the same operation.')
}

function DocumentEditor({ contractId, item, onClose, onSaved }) {
  const { language } = useLanguage()
  const text = (de, en) => language === 'en' ? en : de
  const dialogRef = useRef(null)
  const busyRef = useRef(false)
  const attemptRef = useRef(null)
  const [title, setTitle] = useState(item?.title || '')
  const [description, setDescription] = useState(item?.description || '')
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [locked, setLocked] = useState(false)
  const [error, setError] = useState('')
  const [confirmClose, setConfirmClose] = useState(false)
  const [editMutationId] = useState(() => crypto.randomUUID())
  const editValuesRef = useRef(null)

  useEffect(() => {
    const dialog = dialogRef.current
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    return () => { dialog.close(); document.body.style.overflow = previousOverflow; previousFocus?.focus?.() }
  }, [])

  function close() {
    if (busyRef.current) return
    if (locked || title !== (item?.title || '') || description !== (item?.description || '') || file) setConfirmClose(true)
    else onClose()
  }

  async function discard() {
    if (busyRef.current) return
    busyRef.current = true
    setSaving(true)
    setError('')
    try {
      if (attemptRef.current) {
        const result = await discardContractDocumentUpload(attemptRef.current)
        if (result.ready) { onSaved(); return }
      }
      onClose()
    } catch (failure) { setError(documentError(failure, text)); setConfirmClose(false) }
    finally { busyRef.current = false; setSaving(false) }
  }

  async function submit(event) {
    event.preventDefault()
    if (busyRef.current) return
    if (!title.trim() || title.trim().length > 240 || description.trim().length > 4000) {
      setError(text('Bitte Titel (maximal 240 Zeichen) und eine Beschreibung mit höchstens 4.000 Zeichen angeben.', 'Enter a title (maximum 240 characters) and a description of up to 4,000 characters.')); return
    }
    if (!item && !attemptRef.current && (!file || getPdfFileError(file) || file.size < 1 || file.name.length > 240)) {
      setError(text('Bitte eine nicht leere PDF bis 20 MB mit einem Dateinamen bis 240 Zeichen auswählen.', 'Select a nonempty PDF up to 20 MB with a filename of up to 240 characters.')); return
    }
    busyRef.current = true
    setSaving(true)
    setError('')
    try {
      if (item) {
        editValuesRef.current ??= { title, description }
        setLocked(true)
        await updateContractDocument(contractId, item, editValuesRef.current, editMutationId)
      } else {
        attemptRef.current ??= createDocumentUploadAttempt(contractId, { title, description }, file)
        setLocked(true)
        await uploadContractDocument(attemptRef.current)
      }
      onSaved()
    } catch (failure) { setError(documentError(failure, text)) }
    finally { busyRef.current = false; setSaving(false) }
  }

  return <dialog ref={dialogRef} className="document-modal" aria-labelledby="contract-document-form-title" onCancel={(event) => { event.preventDefault(); close() }}>
    <form className="document-form" onSubmit={submit}>
      <div className="document-form__heading"><h2 id="contract-document-form-title">{item ? text('Dokument bearbeiten', 'Edit document') : text('Dokument hochladen', 'Upload document')}</h2></div>
      <label className="form-field"><span>{text('Titel *', 'Title *')}</span><input autoFocus required maxLength={240} value={title} onChange={(event) => setTitle(event.target.value)} disabled={saving || locked} /></label>
      {!item && <label className="form-field document-form__file"><span>{text('PDF-Datei *', 'PDF file *')}</span><input type="file" accept="application/pdf,.pdf" required disabled={saving || locked} onChange={(event) => setFile(event.target.files?.[0] || null)} /><small>{text('Maximal 20 MB', 'Maximum 20 MB')}</small></label>}
      <label className="form-field"><span>{text('Kurzbeschreibung', 'Description')}</span><textarea rows={3} maxLength={4000} value={description} onChange={(event) => setDescription(event.target.value)} disabled={saving || locked} /></label>
      {locked && error && <p>{text('Die gesendeten Angaben bleiben für eine sichere Wiederholung gesperrt. Zum Ändern das Formular schließen und die Dokumentliste neu laden.', 'Submitted values remain locked for a safe retry. To change them, close this form and reload the document list.')}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><button className="button button--secondary" type="button" disabled={saving} onClick={close}>{text('Abbrechen', 'Cancel')}</button><button className="button" type="submit" disabled={saving || !title.trim()}>{saving ? text('Wird gespeichert …', 'Saving …') : text('Speichern', 'Save')}</button></div>
    </form>
    <ConfirmDialog open={confirmClose} title={text('Formular schließen?', 'Close form?')} message={text('Ungespeicherte Angaben werden verworfen. Ein bereits fertiggestelltes Dokument bleibt erhalten; ein begonnener, unvollständiger Upload wird entfernt.', 'Unsaved input will be discarded. A completed document is kept; an unfinished upload is removed.')} confirmLabel={text('Schließen', 'Close')} cancelLabel={text('Weiter bearbeiten', 'Continue editing')} isSubmitting={saving} onCancel={() => setConfirmClose(false)} onConfirm={discard} />
  </dialog>
}

export default function ContractDocumentsSection({ contractId, canEdit, onChanged }) {
  const { language } = useLanguage()
  const { user } = useAuth()
  const text = (de, en) => language === 'en' ? en : de
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [saved, setSaved] = useState(false)
  const [historyRefreshError, setHistoryRefreshError] = useState(false)
  const [editor, setEditor] = useState(null)
  const [details, setDetails] = useState(null)
  const [deletion, setDeletion] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [recovering, setRecovering] = useState(null)
  const recoveryBusyRef = useRef(false)
  const recoveryIdsRef = useRef(new Map())
  const deletingRef = useRef(false)
  const generationRef = useRef(0)

  const reload = useCallback(async () => {
    const generation = ++generationRef.current
    setLoading(true)
    setLoadError(false)
    try {
      const result = await listContractDocuments(contractId)
      if (generation === generationRef.current) setDocuments(result)
    } catch { if (generation === generationRef.current) setLoadError(true) }
    finally { if (generation === generationRef.current) setLoading(false) }
  }, [contractId])

  useEffect(() => {
    const generation = ++generationRef.current
    listContractDocuments(contractId).then((result) => {
      if (generation === generationRef.current) { setDocuments(result); setLoadError(false) }
    }).catch(() => { if (generation === generationRef.current) setLoadError(true) })
      .finally(() => { if (generation === generationRef.current) setLoading(false) })
    return () => { generationRef.current += 1 }
  }, [contractId])

  function changed() {
    setEditor(null)
    setDeletion(null)
    setSaved(true)
    setHistoryRefreshError(false)
    setActionError(null)
    void reload()
    // A successful mutation stays successful even if subsequent history loading
    // fails. The parent owns its independent refresh/error state.
    if (onChanged) void Promise.resolve().then(() => onChanged()).then((result) => {
      if (result === false) setHistoryRefreshError(true)
    }).catch((failure) => {
      void reportTechnicalFailure({ module: 'contracts', stage: 'load', recordId: contractId, error: failure })
      setHistoryRefreshError(true)
    })
  }

  async function remove() {
    if (!canEdit || deletingRef.current || !deletion) return
    deletingRef.current = true
    setDeleting(true)
    setActionError(null)
    try {
      if (deletion.item.status === 'pending') await recoverContractDocument(contractId, deletion.item, user?.uid, 'document.delete', deletion.mutationId)
      else await deleteContractDocument(contractId, deletion.item, deletion.mutationId)
      changed()
    }
    catch (failure) { setActionError(failure) }
    finally { deletingRef.current = false; setDeleting(false) }
  }

  async function recover(item) {
    if (!canEdit || recoveryBusyRef.current || deletingRef.current || editor) return
    recoveryBusyRef.current = true
    setRecovering(item.id)
    setSaved(false)
    setActionError(null)
    const key = `${item.id}:${item.revision}:finalize`
    if (!recoveryIdsRef.current.has(key)) recoveryIdsRef.current.set(key, crypto.randomUUID())
    try {
      await recoverContractDocument(contractId, item, user?.uid, 'document.finalize', recoveryIdsRef.current.get(key))
      changed()
    } catch (failure) { setActionError(failure); void reload() }
    finally { recoveryBusyRef.current = false; setRecovering(null) }
  }

  const readyDocuments = documents.filter((item) => item.status === 'ready')
  const processingDocuments = documents.filter((item) => item.status !== 'ready')

  return <>
    {saved && <p role="status">{text('Dokumentänderung gespeichert.', 'Document change saved.')}</p>}
    {historyRefreshError && <p className="form-error" role="alert">{text('Die Dokumentänderung wurde gespeichert. Der Verlauf konnte noch nicht aktualisiert werden; bitte den Verlauf erneut laden.', 'The document change was saved. The history could not be refreshed yet; reload the history.')}</p>}
    {loadError && <div className="form-error" role="alert"><p>{saved ? text('Die Änderung wurde gespeichert. Die aktuelle Dokumentliste konnte nicht geladen werden.', 'The change was saved. The current document list could not be loaded.') : text('Dokumente konnten nicht geladen werden. Bitte Verbindung und Berechtigung prüfen.', 'Documents could not be loaded. Check your connection and permissions.')}</p><button className="button button--secondary" onClick={reload} disabled={loading}>{text('Erneut laden', 'Reload')}</button></div>}
    {actionError && !deletion && <p className="form-error" role="alert">{documentError(actionError, text)}</p>}
    <DamageDocumentsCard heading={text('Dokumente', 'Documents')} documents={readyDocuments} loading={loading} canEdit={canEdit && !deleting && !recovering} getDocumentBlob={getContractDocumentBlob} onUpload={() => { setSaved(false); setEditor('new') }} onEdit={(item) => { setSaved(false); setEditor(item) }} onDetails={setDetails} onDelete={(item) => { setActionError(null); setSaved(false); setDeletion({ item, mutationId: crypto.randomUUID() }) }} />
    {processingDocuments.length > 0 && <section className="contract-document-recovery" aria-labelledby="contract-document-recovery-heading">
      <h3 id="contract-document-recovery-heading">{text('Offene Dokumentvorgänge', 'Unfinished document operations')}</h3>
      <ul>{processingDocuments.map((item) => {
        const locked = ['finalizing', 'deleting'].includes(item.status)
        const own = (locked ? item.operationActorId : item.createdBy) === user?.uid
        const recoverable = ['pending', 'finalizing', 'deleting'].includes(item.status)
        const status = item.status === 'pending' ? text('Unvollständiger Upload', 'Incomplete upload') : item.status === 'finalizing' ? text('Upload wird abgeschlossen', 'Upload is being finalized') : item.status === 'deleting' ? text('Löschung begonnen', 'Deletion started') : text('Unbekannter Dokumentstatus – bitte Zugriff und Daten prüfen lassen.', 'Unknown document status – ask an administrator to check the data and access.')
        return <li className="contract-document-recovery__item" key={item.id}><div><strong>{item.title}</strong><p>{status}</p>{!own && <p>{text('Vorgang eines anderen Benutzers. Die Verarbeitung kann durch diesen Benutzer fortgesetzt werden.', 'This operation belongs to another user, who can resume it.')}</p>}{own && item.status === 'pending' && <p>{text('Ein vollständig übertragener Upload kann abgeschlossen werden. Fehlt die PDF, entferne den Eintrag und füge die Datei erneut hinzu.', 'A fully uploaded file can be finalized. If the PDF is missing, remove the entry and add the file again.')}</p>}</div>
          {canEdit && own && recoverable && <div className="contract-document-recovery__actions"><button className="button button--secondary" type="button" disabled={Boolean(recovering) || deleting || Boolean(editor)} onClick={() => recover(item)}>{recovering === item.id ? text('Wird fortgesetzt …', 'Resuming …') : text('Vorgang fortsetzen', 'Resume operation')}</button>{item.status === 'pending' && <button className="button button--danger" type="button" disabled={Boolean(recovering) || deleting || Boolean(editor)} onClick={() => { setActionError(null); setSaved(false); setDeletion({ item, mutationId: crypto.randomUUID() }) }}>{text('Unvollständigen Upload entfernen', 'Remove incomplete upload')}</button>}</div>}
        </li>
      })}</ul>
    </section>}
    {editor && canEdit && <DocumentEditor key={`${contractId}:${editor === 'new' ? 'new' : editor.id}`} contractId={contractId} item={editor === 'new' ? null : editor} onClose={() => { setEditor(null); void reload() }} onSaved={changed} />}
    {details && <DocumentDetailsModal documentItem={details} onClose={() => setDetails(null)} />}
    <ConfirmDialog open={Boolean(deletion) && canEdit} title={text('Dokument dauerhaft löschen?', 'Permanently delete document?')} message={actionError ? documentError(actionError, text) : text('Die PDF und ihre Dokumentangaben werden dauerhaft gelöscht. Dieser Vorgang kann nicht rückgängig gemacht werden.', 'The PDF and its metadata will be permanently deleted. This cannot be undone.')} confirmLabel={text(actionError ? 'Erneut versuchen' : 'Endgültig löschen', actionError ? 'Retry' : 'Delete permanently')} submittingLabel={text('Wird gelöscht …', 'Deleting …')} variant="danger" isSubmitting={deleting} onCancel={() => { setDeletion(null); setActionError(null); void reload() }} onConfirm={remove} />
  </>
}
