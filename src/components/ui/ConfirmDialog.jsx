import { useEffect, useRef } from 'react'

export default function ConfirmDialog({ cancelLabel = 'Abbrechen', confirmLabel = 'Bestätigen', isSubmitting = false, message, onCancel, onConfirm, open, submittingLabel = 'Wird ausgeführt …', title, variant = 'primary' }) {
  const dialogRef = useRef(null)
  const confirmButtonRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const previouslyFocusedElement = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    requestAnimationFrame(() => confirmButtonRef.current?.focus())
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isSubmitting) onCancel()
      if (event.key !== 'Tab') return
      const focusableElements = dialogRef.current?.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
      if (!focusableElements?.length) return
      const first = focusableElements[0]
      const last = focusableElements[focusableElements.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocusedElement?.focus?.()
    }
  }, [isSubmitting, onCancel, open])

  if (!open) return null

  return <div className="confirm-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSubmitting) onCancel() }}>
    <section ref={dialogRef} className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-message" tabIndex="-1">
      <h2 id="confirm-dialog-title">{title}</h2>
      <p id="confirm-dialog-message">{message}</p>
      <div className="confirm-dialog__actions"><button className="button button--secondary" type="button" onClick={onCancel} disabled={isSubmitting}>{cancelLabel}</button><button ref={confirmButtonRef} className={`button${variant === 'danger' ? ' button--danger' : ''}`} type="button" onClick={onConfirm} disabled={isSubmitting}>{isSubmitting ? submittingLabel : confirmLabel}</button></div>
    </section>
  </div>
}
