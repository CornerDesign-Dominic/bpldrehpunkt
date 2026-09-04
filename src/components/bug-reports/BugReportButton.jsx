import { useEffect, useRef, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { useAuth } from '../../auth/useAuth.js'
import { functions } from '../../lib/firebase.js'
import { BugIcon, CloseIcon } from '../icons.jsx'
import Toast from '../ui/Toast.jsx'

const modules = ['Dashboard', 'Urlaub', 'Kalender', 'Urlaubsmanagement', 'Team Brennpunkt', 'Kunden & Unternehmer', 'CRM', 'Palettenmanagement', 'News', 'Dokumente', 'To-dos', 'Mein Profil', 'Adminbereich', 'Sonstiges']
const emptyForm = () => ({ module: '', description: '' })

function BugReportModal({ onClose, onSuccess }) {
  const dialogRef = useRef(null)
  const moduleRef = useRef(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const previouslyFocusedElement = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    requestAnimationFrame(() => moduleRef.current?.focus())
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !submitting) onClose()
      if (event.key !== 'Tab') return
      const focusableElements = dialogRef.current?.querySelectorAll('button:not([disabled]), select:not([disabled]), textarea:not([disabled])')
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
  }, [onClose, submitting])

  async function submit(event) {
    event.preventDefault()
    const module = form.module.trim()
    const description = form.description.trim()
    if (!module || !description) {
      setError('Bitte Modul und Beschreibung ausfüllen.')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      await httpsCallable(functions, 'submitBugReport')({ module, description })
      onSuccess()
    } catch (submitError) {
      setError(submitError?.message?.replace(/^.*?:\s*/, '') || 'Die Meldung konnte nicht versendet werden.')
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="bug-report-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) onClose() }}>
    <section ref={dialogRef} className="bug-report-modal" role="dialog" aria-modal="true" aria-labelledby="bug-report-title" tabIndex="-1">
      <div className="bug-report-modal__heading"><div><h2 id="bug-report-title">Fehler melden</h2><p>Beschreibe kurz, was passiert ist.</p></div><button className="bug-report-modal__close" type="button" onClick={onClose} disabled={submitting} aria-label="Dialog schließen"><CloseIcon size={16} /></button></div>
      <form onSubmit={submit} noValidate>
        <div className="bug-report-modal__fields">
          <label className="form-field"><span>Modul *</span><select ref={moduleRef} required value={form.module} onChange={(event) => setForm((current) => ({ ...current, module: event.target.value }))}><option value="">Bitte wählen</option>{modules.map((module) => <option key={module} value={module}>{module}</option>)}</select></label>
          <label className="form-field"><span>Was ist passiert? *</span><textarea required rows="7" maxLength="4000" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="bug-report-modal__actions"><button className="button button--secondary" type="button" onClick={onClose} disabled={submitting}>Abbrechen</button><button className="button" type="submit" disabled={submitting}>{submitting ? 'Wird gesendet …' : 'Meldung senden'}</button></div>
      </form>
    </section>
  </div>
}

export default function BugReportButton() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState('')

  if (!user) return null

  return <>
    <button className="bug-report-button" type="button" onClick={() => setOpen(true)} aria-label="Fehler melden" title="Fehler melden"><BugIcon size={21} /></button>
    {open && <BugReportModal onClose={() => setOpen(false)} onSuccess={() => { setOpen(false); setToast('Danke, deine Meldung wurde versendet.') }} />}
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
  </>
}
