import { useEffect, useRef, useState } from 'react'
import { CheckIcon } from '../icons.jsx'

function valueAsDraft(value) {
  return value === null || value === undefined ? '' : String(value)
}

export function InlineDamageField({ className = '', displayValue, editable, field, label, multiline = false, onSave, options, type = 'text', value }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(() => valueAsDraft(value))
  const [saving, setSaving] = useState(false)
  const controlRef = useRef(null)

  useEffect(() => { if (editing) controlRef.current?.focus() }, [editing])

  function start() {
    setDraft(valueAsDraft(value))
    setEditing(true)
  }

  function cancel() {
    setDraft(valueAsDraft(value))
    setEditing(false)
  }

  async function commit() {
    if (saving) return
    if (draft === valueAsDraft(value)) { setEditing(false); return }
    setSaving(true)
    try {
      await onSave(field, draft)
      setEditing(false)
    } catch {
      // Die Seite zeigt den Speicherfehler an und lässt das Feld offen.
    } finally {
      setSaving(false)
    }
  }

  function blur(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) void commit()
  }

  const content = !editing
    ? editable
      ? <button className="damage-inline-field__display" type="button" onClick={start} title={`${label} bearbeiten`}>{displayValue || '—'}</button>
      : <span className="damage-inline-field__readonly">{displayValue || '—'}</span>
    : <div className="damage-inline-field__editor" onBlur={blur}>{multiline ? <textarea ref={controlRef} rows="3" value={draft} maxLength="4000" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); cancel() } if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void commit() } }} /> : options ? <select ref={controlRef} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); cancel() } if (event.key === 'Enter') { event.preventDefault(); void commit() } }}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input ref={controlRef} type={type} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); cancel() } if (event.key === 'Enter') { event.preventDefault(); void commit() } }} />}{<button className="damage-inline-field__confirm" type="button" onClick={() => void commit()} disabled={saving} aria-label={`${label} speichern`} title="Speichern"><CheckIcon size={14} /></button>}</div>

  return <div className={`damage-inline-field${className ? ` ${className}` : ''}`}><dt>{label}</dt><dd>{content}</dd></div>
}

export function InlineDamageTitle({ editable, onSave, value }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(() => valueAsDraft(value))
  const [saving, setSaving] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  function start() {
    setDraft(valueAsDraft(value))
    setEditing(true)
  }

  async function commit() {
    if (saving) return
    if (!draft.trim() || draft === valueAsDraft(value)) { setEditing(false); return }
    setSaving(true)
    try { await onSave('title', draft); setEditing(false) } catch {
      // Die Seite zeigt den Speicherfehler an und lässt das Feld offen.
    } finally { setSaving(false) }
  }

  if (!editable) return <p className="damage-detail-title">{value || '—'}</p>
  if (!editing) return <button className="damage-detail-title damage-detail-title--editable" type="button" onClick={start} title="Kurzbezeichnung bearbeiten">{value || 'Kurzbezeichnung ergänzen'}</button>
  return <div className="damage-detail-title-editor" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) void commit() }}><input ref={inputRef} value={draft} maxLength="500" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); setDraft(valueAsDraft(value)); setEditing(false) } if (event.key === 'Enter') { event.preventDefault(); void commit() } }} /><button className="damage-inline-field__confirm" type="button" onClick={() => void commit()} disabled={saving} aria-label="Kurzbezeichnung speichern" title="Speichern"><CheckIcon size={14} /></button></div>
}
