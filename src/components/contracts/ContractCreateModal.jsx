import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../../i18n/useLanguage.js'
import { createContract, newContractId } from '../../lib/contracts.js'
import ConfirmDialog from '../ui/ConfirmDialog.jsx'

export default function ContractCreateModal({ userId, onClose, onCreated }) {
  const { language } = useLanguage()
  const text = (de, en) => language === 'en' ? en : de
  const dialogRef = useRef(null)
  const busyRef = useRef(false)
  const [id] = useState(newContractId)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [attemptedName, setAttemptedName] = useState(null)
  const [confirmClose, setConfirmClose] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    const previousFocus = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    return () => { dialog.close(); document.body.style.overflow = overflow; previousFocus?.focus?.() }
  }, [])

  function close() {
    if (busyRef.current) return
    if (name.trim()) { setConfirmClose(true); return }
    onClose()
  }

  async function submit(event) {
    event.preventDefault()
    if (busyRef.current || !name.trim()) return
    busyRef.current = true
    setSaving(true)
    setError('')
    // Once sent, keep the same payload for retries after an uncertain response.
    const partnerName = attemptedName ?? name.trim()
    setAttemptedName(partnerName)
    try {
      await createContract(id, partnerName, userId)
      onCreated(id)
    } catch {
      setError(text('Der Vertrag konnte nicht bestätigt werden. Bitte Verbindung und Berechtigung prüfen und erneut versuchen.', 'The contract could not be confirmed. Check your connection and permissions, then retry.'))
    } finally {
      busyRef.current = false
      setSaving(false)
    }
  }

  return <dialog ref={dialogRef} className="contract-create-dialog" aria-labelledby="contract-create-title" onCancel={(event) => { event.preventDefault(); close() }} onClick={(event) => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close() } }}>
    <form className="damage-form" onSubmit={submit}>
      <h2 id="contract-create-title">{text('Vertrag hinzufügen', 'Add contract')}</h2>
      <label className="form-field"><span>{text('Vertragspartner *', 'Contract partner *')}</span><input autoFocus required maxLength={240} value={name} onChange={(event) => setName(event.target.value)} readOnly={attemptedName !== null} disabled={saving} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><button className="button button--secondary" type="button" disabled={saving} onClick={close}>{text('Abbrechen', 'Cancel')}</button><button className="button" type="submit" disabled={saving || !name.trim()}>{saving ? text('Wird angelegt …', 'Creating …') : text('Vertrag anlegen', 'Create contract')}</button></div>
    </form>
    <ConfirmDialog open={confirmClose} title={text('Eingaben verwerfen?', 'Discard input?')} message={text('Der Vertrag wurde noch nicht bestätigt. Möchtest du das Formular schließen?', 'The contract has not been confirmed yet. Do you want to close the form?')} cancelLabel={text('Weiter bearbeiten', 'Continue editing')} confirmLabel={text('Verwerfen', 'Discard')} onCancel={() => setConfirmClose(false)} onConfirm={onClose} />
  </dialog>
}
