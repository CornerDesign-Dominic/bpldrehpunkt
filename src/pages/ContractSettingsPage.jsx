import { useCallback, useEffect, useRef, useState } from 'react'
import { usePermissions } from '../auth/usePermissions.js'
import { useLanguage } from '../i18n/useLanguage.js'
import { listContractCostCategories, saveContractCostCategory } from '../lib/contractCostCategories.js'
import { EditIcon } from '../components/icons.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import '../styles/contracts.css'

function categoryError(error, text) {
  const code = String(error?.code || '').split('/').at(-1)
  if (code === 'aborted' || code === 'failed-precondition') return text('Die Kostenposition wurde inzwischen geändert. Bitte die Liste neu laden und die Änderung erneut erfassen.', 'This cost category has changed. Reload the list and enter your change again.')
  if (code === 'already-exists') return text('Diese Kostenposition existiert bereits. Bitte die Liste neu laden oder einen anderen Namen verwenden.', 'This cost category already exists. Reload the list or use a different name.')
  if (code === 'permission-denied') return text('Keine Berechtigung zum Bearbeiten der Kostenpositionen. Bitte die Zugriffsrechte prüfen.', 'You do not have permission to edit cost categories. Check your access rights.')
  if (code === 'invalid-argument') return text('Die Angaben sind ungültig. Bitte Name und Bearbeitungsstand prüfen.', 'These values are invalid. Check the name and editing state.')
  return text('Die Änderung konnte nicht bestätigt werden. Bitte Verbindung prüfen und denselben Vorgang erneut versuchen.', 'The change could not be confirmed. Check your connection and retry the same operation.')
}

function CategoryEditor({ item, onClose, onSaved }) {
  const { language } = useLanguage()
  const text = (de, en) => language === 'en' ? en : de
  const dialogRef = useRef(null)
  const busyRef = useRef(false)
  const operationRef = useRef(null)
  const [name, setName] = useState(item?.name || '')
  const [saving, setSaving] = useState(false)
  const [locked, setLocked] = useState(false)
  const [error, setError] = useState(null)
  const [confirmClose, setConfirmClose] = useState(false)

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
    if (locked || name !== (item?.name || '')) setConfirmClose(true)
    else onClose()
  }

  async function submit(event) {
    event.preventDefault()
    if (busyRef.current || !name.trim()) return
    busyRef.current = true
    setSaving(true)
    setError(null)
    operationRef.current ??= {
      recordId: item?.id || crypto.randomUUID(), mutationId: crypto.randomUUID(), expectedRevision: item?.revision || 0,
      values: { name: name.trim(), active: item ? item.active : true },
    }
    setLocked(true)
    try { await saveContractCostCategory(operationRef.current); onSaved() }
    catch (failure) { setError(failure) }
    finally { busyRef.current = false; setSaving(false) }
  }

  return <dialog ref={dialogRef} className="contract-create-dialog" aria-labelledby="contract-category-editor-title" onCancel={(event) => { event.preventDefault(); close() }}>
    <form className="damage-form" onSubmit={submit}>
      <h2 id="contract-category-editor-title">{item ? text('Kostenposition umbenennen', 'Rename cost category') : text('Kostenposition hinzufügen', 'Add cost category')}</h2>
      <label className="form-field"><span>{text('Name *', 'Name *')}</span><input autoFocus required maxLength={240} value={name} onChange={(event) => setName(event.target.value)} disabled={saving || locked} /></label>
      {error && <p className="form-error" role="alert">{categoryError(error, text)}</p>}
      {locked && error && <p>{text('Für eine sichere Wiederholung bleiben die gesendeten Angaben gesperrt. Zum Ändern das Formular schließen und die Liste neu laden.', 'Submitted values remain locked for a safe retry. To change them, close this form and reload the list.')}</p>}
      <div className="form-actions"><button className="button button--secondary" type="button" disabled={saving} onClick={close}>{text('Abbrechen', 'Cancel')}</button><button className="button" type="submit" disabled={saving || !name.trim()}>{saving ? text('Wird gespeichert …', 'Saving …') : text('Speichern', 'Save')}</button></div>
    </form>
    <ConfirmDialog open={confirmClose} title={text('Formular schließen?', 'Close form?')} message={text('Ungespeicherte Angaben werden verworfen. Eine bereits gespeicherte Änderung bleibt erhalten.', 'Unsaved input will be discarded. Any change already saved is kept.')} confirmLabel={text('Schließen', 'Close')} cancelLabel={text('Weiter bearbeiten', 'Continue editing')} onCancel={() => setConfirmClose(false)} onConfirm={onClose} />
  </dialog>
}

export default function ContractSettingsPage() {
  const { canEdit } = usePermissions()
  const editable = canEdit('contracts')
  const { language } = useLanguage()
  const text = (de, en) => language === 'en' ? en : de
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [editor, setEditor] = useState(null)
  const [pendingOperation, setPendingOperation] = useState(null)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [saved, setSaved] = useState(false)
  const busyRef = useRef(false)
  const generationRef = useRef(0)

  const reload = useCallback(async () => {
    const generation = ++generationRef.current
    setLoading(true)
    setLoadError(false)
    try { const result = await listContractCostCategories(); if (generation === generationRef.current) setEntries(result) }
    catch { if (generation === generationRef.current) setLoadError(true) }
    finally { if (generation === generationRef.current) setLoading(false) }
  }, [])

  useEffect(() => {
    const generation = ++generationRef.current
    listContractCostCategories().then((result) => { if (generation === generationRef.current) setEntries(result) })
      .catch(() => { if (generation === generationRef.current) setLoadError(true) })
      .finally(() => { if (generation === generationRef.current) setLoading(false) })
    return () => { generationRef.current += 1 }
  }, [])

  function changed() {
    setEditor(null)
    setPendingOperation(null)
    setActionError(null)
    setSaved(true)
    void reload()
  }

  async function toggle(operation) {
    if (!editable || busyRef.current) return
    busyRef.current = true
    setPendingOperation(operation)
    setSaving(true)
    setSaved(false)
    setActionError(null)
    try { await saveContractCostCategory(operation); changed() }
    catch (failure) { setActionError(failure) }
    finally { busyRef.current = false; setSaving(false) }
  }

  return <div className="contracts-page">
    <section className="contract-panel" aria-labelledby="contract-cost-categories-heading">
      <div className="contracts-toolbar"><h2 id="contract-cost-categories-heading">{text('Kostenpositionen', 'Cost categories')}</h2>{editable && <button className="button" type="button" disabled={loading || saving || Boolean(pendingOperation)} onClick={() => { setSaved(false); setEditor('new') }}>{text('Kostenposition hinzufügen', 'Add cost category')}</button>}</div>
      <p>{text('Kostenpositionen dienen zur prozentualen Aufteilung des gesamten Vertrags. Die Zuordnung und Prozentanteile werden in der jeweiligen Vertragsakte gepflegt.', 'Cost categories classify the percentage allocation of the whole contract. Assignments and percentages are managed in each contract file.')}</p>
      <p>{text('Deaktivierte Kostenpositionen bleiben für bestehende Zuordnungen erhalten.', 'Inactive cost categories remain available for existing assignments.')}</p>
      {!editable && <p>{text('Du kannst die Kostenpositionen ansehen. Zum Bearbeiten ist die Berechtigung „Vertragsmanagement: Bearbeiten“ erforderlich.', 'You can view cost categories. Editing requires the “Contract management: Edit” permission.')}</p>}
      {saved && <p role="status">{text('Kostenposition gespeichert.', 'Cost category saved.')}</p>}
      {loadError && <div className="form-error" role="alert"><p>{saved ? text('Die Änderung wurde gespeichert. Die aktuelle Liste konnte nicht geladen werden.', 'The change was saved. The current list could not be loaded.') : text('Kostenpositionen konnten nicht geladen werden. Bitte Verbindung und Berechtigung prüfen.', 'Cost categories could not be loaded. Check your connection and permissions.')}</p></div>}
      {actionError && <div className="form-error" role="alert"><p>{categoryError(actionError, text)}</p><div className="form-actions"><button className="button button--secondary" type="button" disabled={saving} onClick={() => toggle(pendingOperation)}>{text('Vorgang erneut versuchen', 'Retry operation')}</button><button className="button button--secondary" type="button" disabled={saving} onClick={() => { setPendingOperation(null); setActionError(null); void reload() }}>{text('Liste neu laden', 'Reload list')}</button></div></div>}
      <div className="contracts-table-frame"><table className="data-table"><thead><tr><th scope="col">{text('Name', 'Name')}</th><th scope="col">{text('Status', 'Status')}</th>{editable && <th scope="col">{text('Aktionen', 'Actions')}</th>}</tr></thead><tbody>{entries.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.active ? text('Aktiv', 'Active') : text('Deaktiviert', 'Inactive')}</td>{editable && <td><div className="form-actions"><button className="todo-detail-section-edit" type="button" title={text('Kostenposition umbenennen', 'Rename cost category')} aria-label={text(`${item.name} umbenennen`, `Rename ${item.name}`)} disabled={loading || saving || Boolean(pendingOperation)} onClick={() => { setSaved(false); setEditor(item) }}><EditIcon size={16} /></button><button className="button button--secondary" type="button" disabled={loading || saving || Boolean(pendingOperation)} onClick={() => toggle({ recordId: item.id, mutationId: crypto.randomUUID(), expectedRevision: item.revision, values: { name: item.name, active: !item.active } })}>{item.active ? text('Deaktivieren', 'Deactivate') : text('Aktivieren', 'Activate')}</button></div></td>}</tr>)}{!entries.length && <tr><td colSpan={editable ? 3 : 2} className="table-state">{loading ? text('Kostenpositionen werden geladen …', 'Loading cost categories …') : loadError ? text('Keine Daten verfügbar.', 'No data available.') : text('Noch keine Kostenpositionen vorhanden.', 'No cost categories yet.')}</td></tr>}</tbody></table></div>
      <button className="button button--secondary" type="button" disabled={loading || saving} onClick={reload}>{text('Liste neu laden', 'Reload list')}</button>
    </section>
    {editor && editable && <CategoryEditor key={editor === 'new' ? 'new' : `${editor.id}:${editor.revision}`} item={editor === 'new' ? null : editor} onClose={() => { setEditor(null); void reload() }} onSaved={changed} />}
  </div>
}
