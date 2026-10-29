import { useEffect, useRef, useState } from 'react'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { useLanguage } from '../../i18n/useLanguage.js'
import { reportTechnicalFailure } from '../../lib/diagnostics.js'

GlobalWorkerOptions.workerSrc = pdfWorker

export default function MailAttachmentPdf({ blob, name }) {
  const { language } = useLanguage()
  const w = (de, en) => language === 'en' ? en : de
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [pdf, setPdf] = useState(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [width, setWidth] = useState(600)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    let task
    async function open() {
      try {
        const data = new Uint8Array(await blob.arrayBuffer())
        if (!active) return
        task = getDocument({ data, enableScripting: false, isEvalSupported: false })
        const document = await task.promise
        if (active) { setPdf(document); setPageNumber(1); setError(false) }
      } catch (error) {
        if (active) { setError(true); setBusy(false); void reportTechnicalFailure({ module: 'mailboxes', stage: 'attachment', error }) }
      }
    }
    void open()
    return () => { active = false; void task?.destroy() }
  }, [blob])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(180, Math.min(1400, entry.contentRect.width))))
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!pdf) return
    let active = true
    let rendering
    async function render() {
      try {
        const page = await pdf.getPage(pageNumber)
        if (!active || !canvasRef.current) return
        setBusy(true); setError(false)
        const base = page.getViewport({ scale: 1 })
        const density = Math.min(window.devicePixelRatio || 1, 2)
        const desiredScale = width * density / base.width
        const pixelLimitScale = Math.sqrt(8_000_000 / (base.width * base.height))
        const viewport = page.getViewport({ scale: Math.min(desiredScale, pixelLimitScale, 4) })
        const canvas = canvasRef.current
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
        const context = canvas.getContext('2d', { alpha: false })
        if (!context) throw new Error('PDF canvas unavailable')
        rendering = page.render({ canvasContext: context, viewport })
        await rendering.promise
        if (active) setBusy(false)
      } catch (error) {
        if (active && error?.name !== 'RenderingCancelledException') { setError(true); setBusy(false); void reportTechnicalFailure({ module: 'mailboxes', stage: 'attachment', error }) }
      }
    }
    void render()
    return () => { active = false; rendering?.cancel() }
  }, [pdf, pageNumber, width])

  function changePage(next) { setBusy(true); setPageNumber(next) }
  return <div className="mailbox-pdf-viewer" ref={containerRef}>
    {pdf && <div className="mailbox-pdf-controls"><button type="button" disabled={pageNumber <= 1} onClick={() => changePage(pageNumber - 1)}>{w('Vorherige Seite', 'Previous page')}</button><span>{w('Seite', 'Page')} {pageNumber} / {pdf.numPages}</span><button type="button" disabled={pageNumber >= pdf.numPages} onClick={() => changePage(pageNumber + 1)}>{w('Nächste Seite', 'Next page')}</button></div>}
    {busy && <p role="status">{w('PDF wird dargestellt …', 'Rendering PDF …')}</p>}
    {error && <p role="alert">{w('Diese PDF kann nicht dargestellt werden. Bitte lade sie über die Anhangliste herunter.', 'This PDF cannot be displayed. Download it from the attachment list.')}</p>}
    <canvas ref={canvasRef} role="img" aria-label={`${name} · ${w('Seite', 'Page')} ${pageNumber}`} style={{ display: error ? 'none' : 'block', visibility: busy ? 'hidden' : 'visible' }} />
  </div>
}
