import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../../i18n/useLanguage.js'
import { contractMutationError } from '../../lib/contractPresentation.js'

export default function ContractRemarkCard({ contract, editable, onSave }) {
  const { language } = useLanguage()
  const text = (de, en) => language === 'en' ? en : de
  const [draft, setDraft] = useState(null)
  const value = draft?.value ?? contract.remark ?? ''
  const revision = draft?.revision ?? contract.revision ?? 0
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const attempts = useRef(new Map())
  const busy = useRef(false)
  const dirty = value !== (contract.remark || '')
  useEffect(() => {
    if (!dirty) return
    const warn = (event) => { event.preventDefault(); event.returnValue = '' }
    const click = (event) => {
      const anchor = event.target.closest('a[href]')
      if (anchor && anchor.target !== '_blank' && !event.ctrlKey && !event.metaKey && (busy.current || !window.confirm(language === 'en' ? 'Your remark has not been saved. Leave anyway?' : 'Die Bemerkung ist noch nicht gespeichert. Trotzdem verlassen?'))) { event.preventDefault(); event.stopPropagation() }
    }
    window.addEventListener('beforeunload', warn); document.addEventListener('click', click, true)
    return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('click', click, true) }
  }, [dirty, language])
  async function submit(event) {
    event.preventDefault()
    if (busy.current) return
    const key = JSON.stringify([value, revision])
    if (!attempts.current.has(key)) attempts.current.set(key, crypto.randomUUID())
    busy.current = true; setSaving(true); setError('')
    try { await onSave({ remark: value }, { mutationId: attempts.current.get(key), expectedRevision: revision, recordId: contract.id }); setDraft(null) }
    catch (failure) { setError(contractMutationError(failure, language)) }
    finally { busy.current = false; setSaving(false) }
  }
  return <section className="contract-panel contract-remark"><form onSubmit={submit}>
    <label className="form-field"><span>{text('Bemerkung', 'Remark')}</span><textarea rows={3} maxLength={4000} value={value} readOnly={!editable} disabled={saving} onChange={(event) => setDraft((previous) => ({ value: event.target.value, revision: previous?.revision ?? contract.revision ?? 0 }))} /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    {editable && dirty && <div className="form-actions"><button type="button" className="button button--secondary" disabled={saving} onClick={() => { setDraft(null); setError('') }}>{text('Verwerfen', 'Discard')}</button><button className="button" disabled={saving}>{saving ? text('Wird gespeichert …', 'Saving …') : text('Bemerkung speichern', 'Save remark')}</button></div>}
  </form></section>
}
