import { useEffect, useId, useRef } from 'react'
import { useLanguage } from '../../i18n/useLanguage.js'
import '../../styles/mailboxes.css'

export default function MailWorkDialog({ open, title, subtitle, left, children, onClose, busy = false }) {
  const { language } = useLanguage()
  const ref = useRef(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    const dialog = ref.current
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    return () => { dialog.close(); document.body.style.overflow = overflow }
  }, [open])
  return <dialog ref={ref} className="mailbox-reply-dialog mail-work-dialog" aria-labelledby={id} onCancel={event => { event.preventDefault(); event.stopPropagation(); if (!busy) onClose() }}>
    <div className="mailbox-panel-heading mailbox-reply-dialog__heading"><div><h2 id={id}>{title}</h2>{subtitle && <p className="mailbox-hint">{subtitle}</p>}</div><button className="button button--secondary" type="button" disabled={busy} onClick={onClose}>{language === 'en' ? 'Close' : 'Schließen'}</button></div>
    <div className="mailbox-reply-dialog__columns"><article className="mailbox-reader" tabIndex={0} aria-label={language === 'en' ? 'Correspondence' : 'Schriftverkehr'}>{left}</article><div className="mailbox-reply mail-status-editor">{children}</div></div>
  </dialog>
}
