import { useEffect, useId, useRef } from 'react'
import { useLanguage } from '../../i18n/useLanguage.js'
import '../../styles/mailboxes.css'

export default function MailWorkDialog({ open, title, subtitle, left, children, onClose, busy = false, rightLoading = false, loadingLabel }) {
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
    <div className="mailbox-reply-dialog__columns"><article className="mailbox-reader" tabIndex={0} aria-label={language === 'en' ? 'Correspondence' : 'Schriftverkehr'}>{left}</article><div className={`mailbox-reply mail-status-editor${rightLoading ? ' is-loading' : ''}`} aria-busy={rightLoading}>
      <div className="mail-work-dialog__editor-content" inert={rightLoading}>{children}</div>
      {rightLoading && <div className="mail-work-dialog__loading" role="status" aria-live="polite"><div className="mail-work-dialog__loading-card"><span className="mail-work-dialog__spinner" aria-hidden="true" /><strong>{loadingLabel || (language === 'en' ? 'Processing …' : 'Wird verarbeitet …')}</strong><span>{language === 'en' ? 'Please wait a moment.' : 'Bitte einen Moment warten.'}</span></div></div>}
    </div></div>
  </dialog>
}
