import { useEffect, useRef } from 'react'
import { useLanguage } from '../../i18n/useLanguage.js'

let openDialogs = 0
let bodyOverflow = ''

export default function KnowledgeDialog({ title, onClose, children, large = false, compact = false }) {
  const dialog = useRef(null)
  const heading = useRef(null)
  const { language } = useLanguage()
  useEffect(() => {
    const previous = document.activeElement
    const element = dialog.current
    if (openDialogs === 0) bodyOverflow = document.body.style.overflow
    openDialogs += 1
    element.showModal()
    document.body.style.overflow = 'hidden'
    return () => { element.close(); openDialogs -= 1; if (openDialogs === 0) document.body.style.overflow = bodyOverflow; if (previous?.isConnected) previous.focus?.() }
  }, [])
  useEffect(() => { dialog.current.scrollTop = 0; heading.current?.focus() }, [title])
  return <dialog ref={dialog} className={`quality-dialog quality-dialog--editor knowledge-dialog${large ? ' knowledge-history-dialog' : ''}${compact ? ' knowledge-dialog--compact' : ''}`} aria-label={title} onCancel={(event) => { event.preventDefault(); onClose() }}>
    <header className="quality-heading"><h2 ref={heading} tabIndex={-1}>{title}</h2><button type="button" className="button button--secondary" onClick={onClose}>{language === 'en' ? 'Close' : 'Schließen'}</button></header>{children}
  </dialog>
}
