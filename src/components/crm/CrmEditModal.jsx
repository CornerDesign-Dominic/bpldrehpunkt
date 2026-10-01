import { StaticText, TranslatedProps } from '../../i18n/AutoTranslate.jsx'
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from '../icons.jsx'

export default function CrmEditModal({ title, description, onClose, onSubmit, saving, changed, error, children, saveLabel = 'Speichern', className = '', fieldsClassName = '' }) {
  const dialogRef = useRef(null)
  useEffect(() => {
    const previousFocus = document.activeElement
    dialogRef.current?.querySelector('input, select, textarea')?.focus()
    return () => { if (previousFocus?.isConnected) previousFocus.focus() }
  }, [])

  function handleKeyDown(event) {
    if (event.key === 'Escape' && !saving) { event.stopPropagation(); onClose(); return }
    if (event.key !== 'Tab') return
    const focusable = [...dialogRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')]
    if (!focusable.length) return
    if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1).focus() }
    else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus() }
  }

  return createPortal(<div className="crm-edit-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }} onKeyDown={handleKeyDown}>
    <section className={`crm-edit-modal${className ? ` ${className}` : ''}`} ref={dialogRef} role="dialog" aria-modal="true" aria-label={title}>
      <div className="crm-edit-modal__heading"><div><h2>{title}</h2><p>{description}</p></div><TranslatedProps sources={{"aria-label":"Dialog schließen"}}><button type="button" onClick={onClose} disabled={saving} aria-label="Dialog schließen"><CloseIcon /></button></TranslatedProps></div>
      <form onSubmit={onSubmit}><div className={`crm-edit-modal__fields${fieldsClassName ? ` ${fieldsClassName}` : ''}`}>{children}</div>{error && <p className="form-error" role="alert">{<StaticText source={error} />}</p>}<div className="crm-edit-modal__actions"><button className="button button--secondary" type="button" onClick={onClose} disabled={saving}><StaticText source={"Abbrechen"} /></button><button className="button" type="submit" disabled={saving || !changed}>{<StaticText source={saving ? 'Wird gespeichert …' : saveLabel} />}</button></div></form>
    </section>
  </div>, document.body)
}
