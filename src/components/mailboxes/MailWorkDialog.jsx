import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { useLanguage } from '../../i18n/useLanguage.js'
import '../../styles/mailboxes.css'

const splitKey = 'drehpunkt.mailDocumentSplit.v1'
const clampSplit = value => Math.min(75, Math.max(30, value))
function storedSplit() {
  try {
    const value = Number(localStorage.getItem(splitKey))
    return Number.isFinite(value) && value >= 30 && value <= 75 ? value : 52
  } catch { return 52 }
}

export default function MailWorkDialog({ open, title, subtitle, left, children, onClose, busy = false, rightLoading = false, loadingLabel }) {
  const { language } = useLanguage()
  const ref = useRef(null)
  const columns = useRef(null)
  const reader = useRef(null)
  const editor = useRef(null)
  const scroll = useRef({ reader: 0, editor: 0 })
  const [split, setSplit] = useState(storedSplit)
  const [expanded, setExpanded] = useState(false)
  const [dragging, setDragging] = useState(false)
  const id = useId()
  const readerId = useId()
  const w = (de, en) => language === 'en' ? en : de
  useEffect(() => {
    try { localStorage.setItem(splitKey, String(split)) } catch { /* Optional layout preference. */ }
  }, [split])
  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => setSplit(storedSplit()), 0)
    return () => clearTimeout(timer)
  }, [open])
  useLayoutEffect(() => {
    reader.current.scrollTop = scroll.current.reader
    editor.current.scrollTop = scroll.current.editor
  }, [expanded])
  function toggleDocument() {
    if (!expanded) scroll.current = { reader: reader.current.scrollTop, editor: editor.current.scrollTop }
    else scroll.current.reader = reader.current.scrollTop
    setExpanded(value => !value)
  }
  function resize(event) {
    const bounds = columns.current.getBoundingClientRect()
    setSplit(clampSplit((event.clientX - bounds.left - 7) / (bounds.width - 14) * 100))
  }
  function resizeWithKeyboard(event) {
    const step = event.shiftKey ? 10 : 2
    const next = { ArrowLeft: split - step, ArrowRight: split + step, Home: 30, End: 75 }[event.key]
    if (next === undefined) return
    event.preventDefault()
    setSplit(clampSplit(next))
  }
  useEffect(() => {
    if (!open) return
    const dialog = ref.current
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    return () => { dialog.close(); document.body.style.overflow = overflow }
  }, [open])
  return <dialog ref={ref} className={`mailbox-reply-dialog mail-work-dialog${expanded ? ' is-document-expanded' : ''}${dragging ? ' is-resizing' : ''}`} aria-labelledby={id} onCancel={event => { event.preventDefault(); event.stopPropagation(); if (!busy) onClose() }}>
    <div className="mailbox-panel-heading mailbox-reply-dialog__heading"><div><h2 id={id}>{title}</h2>{subtitle && <p className="mailbox-hint">{subtitle}</p>}</div><div className="mail-work-dialog__tools"><button className="button button--secondary" type="button" aria-pressed={expanded} onClick={toggleDocument}>{expanded ? w('Geteilte Ansicht', 'Split view') : w('Dokument vergrößern', 'Enlarge document')}</button><button className="button button--secondary" type="button" disabled={busy} onClick={onClose}>{w('Schließen', 'Close')}</button></div></div>
    <div ref={columns} className="mailbox-reply-dialog__columns mail-work-dialog__columns" style={{ '--mail-document-share': `${split}fr`, '--mail-result-share': `${100 - split}fr` }}><article ref={reader} id={readerId} className="mailbox-reader" tabIndex={0} aria-label={w('Schriftverkehr', 'Correspondence')}>{left}</article>
    <div className="mail-work-dialog__divider" role="separator" tabIndex={expanded ? -1 : 0} aria-label={w('Dokumentbreite anpassen', 'Adjust document width')} aria-orientation="vertical" aria-controls={readerId} aria-valuemin={30} aria-valuemax={75} aria-valuenow={Math.round(split)} aria-valuetext={`${Math.round(split)} %`} title={w('Ziehen oder mit den Pfeiltasten verschieben', 'Drag or use the arrow keys')} onKeyDown={resizeWithKeyboard} onDoubleClick={() => setSplit(52)} onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); setDragging(true) }} onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) resize(event) }} onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); setDragging(false) }} onPointerCancel={() => setDragging(false)} onLostPointerCapture={() => setDragging(false)} />
    {dragging && <div className="mail-work-dialog__resize-shield" aria-hidden="true" />}
    <div ref={editor} className={`mailbox-reply mail-status-editor${rightLoading ? ' is-loading' : ''}`} aria-busy={rightLoading}>
      <div className="mail-work-dialog__editor-content" inert={rightLoading}>{children}</div>
      {rightLoading && <div className="mail-work-dialog__loading" role="status" aria-live="polite"><div className="mail-work-dialog__loading-card"><span className="mail-work-dialog__spinner" aria-hidden="true" /><strong>{loadingLabel || (language === 'en' ? 'Processing …' : 'Wird verarbeitet …')}</strong><span>{language === 'en' ? 'Please wait a moment.' : 'Bitte einen Moment warten.'}</span></div></div>}
    </div></div>
  </dialog>
}
