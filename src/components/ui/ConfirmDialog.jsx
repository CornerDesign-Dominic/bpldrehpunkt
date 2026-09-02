import { useEffect, useRef } from 'react'

export default function ConfirmDialog({ cancelLabel = 'Abbrechen', confirmLabel = 'Bestätigen', isSubmitting = false, message, onCancel, onConfirm, open, title }) {
  const confirmButtonRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    confirmButtonRef.current?.focus()
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isSubmitting) onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isSubmitting, onCancel, open])

  if (!open) return null

  return <div className="confirm-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSubmitting) onCancel() }}>
    <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-message">
      <h2 id="confirm-dialog-title">{title}</h2>
      <p id="confirm-dialog-message">{message}</p>
      <div className="confirm-dialog__actions"><button className="button button--secondary" type="button" onClick={onCancel} disabled={isSubmitting}>{cancelLabel}</button><button ref={confirmButtonRef} className="button button--danger" type="button" onClick={onConfirm} disabled={isSubmitting}>{isSubmitting ? 'Wird gelöscht …' : confirmLabel}</button></div>
    </section>
  </div>
}
