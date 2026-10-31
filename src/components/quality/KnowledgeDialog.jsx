import { useEffect, useRef } from 'react'
import { useLanguage } from '../../i18n/useLanguage.js'

export default function KnowledgeDialog({ title, onClose, children, large = false }) {
  const dialog = useRef(null)
  const heading = useRef(null)
  const { language } = useLanguage()
  useEffect(() => {
    const previous = document.activeElement
    const element = dialog.current
    const overflow = document.body.style.overflow
    element.showModal()
    document.body.style.overflow = 'hidden'
    return () => { element.close(); document.body.style.overflow = overflow; previous?.focus?.() }
  }, [])
  useEffect(() => { dialog.current.scrollTop = 0; heading.current?.focus() }, [title])
  return <dialog ref={dialog} className={`quality-dialog quality-dialog--editor${large ? ' knowledge-history-dialog' : ''}`} aria-label={title} onCancel={(event) => { event.preventDefault(); onClose() }}>
    <header className="quality-heading"><h2 ref={heading} tabIndex={-1}>{title}</h2><button type="button" className="button button--secondary" onClick={onClose}>{language === 'en' ? 'Close' : 'Schließen'}</button></header>{children}
  </dialog>
}
