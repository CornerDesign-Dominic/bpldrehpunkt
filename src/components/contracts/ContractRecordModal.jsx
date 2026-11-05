import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../../i18n/useLanguage.js'
import { CONTRACT_CYCLES, CONTRACT_DEADLINE_TYPES, contractMutationError, parseContractMoney } from '../../lib/contractPresentation.js'
import ConfirmDialog from '../ui/ConfirmDialog.jsx'

function initialValues(kind, entry) {
  if (kind === 'payment') return { paymentCycle: entry.paymentCycle || '', paymentAnchorDate: entry.paymentAnchorDate || '' }
  if (kind === 'details') return { partnerName: entry.partnerName || '', contractNumber: entry.contractNumber || '', customerNumber: entry.customerNumber || '', description: entry.description || '' }
  if (kind === 'position') return { title: entry?.title || '', price: entry ? (entry.grossAmountCents / 100).toFixed(2) : '', billingCycle: entry?.billingCycle || 'monthly', anchorDate: entry?.anchorDate || '', note: entry?.note || '' }
  return { title: entry?.title || '', type: entry?.type || 'deadline', date: entry?.date || '', time: entry?.time || '', note: entry?.note || '', completed: entry?.completed === true }
}

export default function ContractRecordModal({ kind, entry, onClose, onSave }) {
  const { language } = useLanguage()
  const text = (de, en) => language === 'en' ? en : de
  const [initial] = useState(() => initialValues(kind, entry))
  const [values, setValues] = useState(initial)
  const [recordId] = useState(() => entry?.id || crypto.randomUUID())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmClose, setConfirmClose] = useState(false)
  const dialogRef = useRef(null)
  const busyRef = useRef(false)
  const attempts = useRef(new Map())
  const dirty = JSON.stringify(initial) !== JSON.stringify(values)
  const title = kind === 'payment' ? text('Zahlungsrhythmus bearbeiten', 'Edit payment schedule') : kind === 'details' ? text('Vertragsdaten bearbeiten', 'Edit contract details') : kind === 'position' ? (entry ? text('Position bearbeiten', 'Edit position') : text('Position hinzufügen', 'Add position')) : entry ? text('Termin / Frist bearbeiten', 'Edit appointment / deadline') : text('Termin / Frist hinzufügen', 'Add appointment / deadline')

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
    if (dirty) setConfirmClose(true)
    else onClose()
  }
  function update(field, value) { setValues((current) => ({ ...current, [field]: value })); setError('') }
  async function submit(event) {
    event.preventDefault()
    if (busyRef.current) return
    let payload = values
    if (kind === 'position') {
      const price = parseContractMoney(values.price)
      if (price === null) {
        setError(text('Bitte einen gültigen Bruttobetrag mit höchstens zwei Nachkommastellen eingeben.', 'Enter a valid gross amount with at most two decimal places.'))
        return
      }
      const { price: ignoredPrice, ...fields } = values
      void ignoredPrice
      payload = { ...fields, grossAmountCents: price }
    }
    const fingerprint = JSON.stringify(payload)
    if (!attempts.current.has(fingerprint)) attempts.current.set(fingerprint, crypto.randomUUID())
    busyRef.current = true
    setSaving(true)
    setError('')
    try {
      await onSave(payload, { recordId, mutationId: attempts.current.get(fingerprint), expectedRevision: entry?.revision || 0 })
    } catch (failure) { setError(contractMutationError(failure, language)) }
    finally { busyRef.current = false; setSaving(false) }
  }
  function field(key, de, en, options = {}) {
    return <label className={`form-field${options.wide ? ' contract-editor__wide' : ''}`}><span>{text(de, en)}{options.required ? ' *' : ''}</span><input autoFocus={options.focus} required={options.required} disabled={saving} type={options.type || 'text'} maxLength={options.maxLength || 240} min={options.min} max={options.max} step={options.step} inputMode={options.inputMode} value={values[key]} onInput={(event) => update(key, event.currentTarget.value)} onChange={(event) => update(key, event.target.value)} /></label>
  }
  function choices(key, de, en, items, required = false) {
    return <label className="form-field"><span>{text(de, en)}{required ? ' *' : ''}</span><select required={required} value={values[key]} disabled={saving} onChange={(event) => update(key, event.target.value)}>{required && <option value="">{text('Bitte wählen', 'Please select')}</option>}{Object.entries(items).map(([value, labels]) => <option key={value} value={value}>{text(...labels)}</option>)}</select></label>
  }
  return <dialog ref={dialogRef} className="contract-create-dialog contract-editor-dialog" aria-labelledby="contract-editor-title" onCancel={(event) => { event.preventDefault(); if (confirmClose) setConfirmClose(false); else close() }}>
    <form className="damage-form" onSubmit={submit}>
      <h2 id="contract-editor-title">{title}</h2>
      <div className="contract-editor__fields">
        {kind === 'payment' ? <>
          {choices('paymentCycle', 'Zahlungsrhythmus', 'Payment cycle', { '': ['Nicht hinterlegt', 'Not specified'], ...CONTRACT_CYCLES })}
          {field('paymentAnchorDate', 'Zahldatum / erstes Bezugsdatum', 'Payment date / first anchor date', { type: 'date', required: Boolean(values.paymentCycle) })}
          <p className="contract-editor__wide contract-muted">{text('Der Zahlungstag richtet sich nach diesem Datum. Zum Entfernen Rhythmus und Datum leeren.', 'The payment day follows this date. Clear both fields to remove the schedule.')}</p>
        </> : kind === 'details' ? <>
          {field('partnerName', 'Vertragspartner', 'Contract partner', { required: true, focus: true, wide: true })}
          {field('contractNumber', 'Vertragsnummer', 'Contract number', { maxLength: 120 })}
          {field('customerNumber', 'Kundennummer beim Vertragspartner', 'Customer number with the contract partner', { maxLength: 120 })}
          <label className="form-field contract-editor__wide"><span>{text('Beschreibung', 'Description')}</span><textarea maxLength={4000} rows={4} disabled={saving} value={values.description} onChange={(event) => update('description', event.target.value)} /></label>
        </> : kind === 'position' ? <>
          {field('title', 'Bezeichnung', 'Description', { required: true, focus: true, wide: true })}
          {field('price', 'Bruttobetrag (EUR)', 'Gross amount (EUR)', { inputMode: 'decimal', required: true, maxLength: 16 })}
          {choices('billingCycle', 'Abrechnung', 'Billing cycle', CONTRACT_CYCLES)}
          {field('anchorDate', 'Bezugsdatum für den Rhythmus', 'Billing cycle anchor date', { type: 'date', required: true })}
        </> : <>
          {field('title', 'Bezeichnung', 'Description', { required: true, focus: true, wide: true })}
          {choices('type', 'Art', 'Type', CONTRACT_DEADLINE_TYPES)}
          {field('date', 'Datum', 'Date', { type: 'date', required: true })}
          {field('time', 'Uhrzeit', 'Time', { type: 'time' })}
          <label className="contract-checkbox"><input type="checkbox" disabled={saving} checked={values.completed} onChange={(event) => update('completed', event.target.checked)} />{text('Erledigt', 'Completed')}</label>
        </>}
        {['position', 'deadline'].includes(kind) && <label className="form-field contract-editor__wide"><span>{text('Hinweis', 'Note')}</span><textarea rows={3} maxLength={kind === 'position' ? 2000 : 4000} disabled={saving} value={values.note} onChange={(event) => update('note', event.target.value)} /></label>}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><button type="button" className="button button--secondary" disabled={saving} onClick={close}>{text('Abbrechen', 'Cancel')}</button><button className="button" type="submit" disabled={saving}>{saving ? text('Wird gespeichert …', 'Saving …') : text('Speichern', 'Save')}</button></div>
    </form>
    <ConfirmDialog open={confirmClose} title={text('Eingaben verwerfen?', 'Discard input?')} message={text('Deine ungespeicherten Eingaben gehen verloren.', 'Your unsaved input will be lost.')} cancelLabel={text('Weiter bearbeiten', 'Continue editing')} confirmLabel={text('Verwerfen', 'Discard')} onCancel={() => setConfirmClose(false)} onConfirm={onClose} />
  </dialog>
}
