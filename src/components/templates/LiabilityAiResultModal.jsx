import { useEffect, useRef } from 'react'
import LiabilityLetterForm from './LiabilityLetterForm.jsx'

export default function LiabilityAiResultModal({ aiDraftData, onChange, onClose, onAccept }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    const previouslyFocusedElement = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    requestAnimationFrame(() => dialogRef.current?.focus())
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocusedElement?.focus?.()
    }
  }, [onClose])

  return <div className="liability-ai-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={dialogRef} className="liability-ai-modal liability-ai-modal--result" role="dialog" aria-modal="true" aria-labelledby="liability-ai-result-title" tabIndex="-1">
      <div className="liability-ai-modal__heading"><div><h2 id="liability-ai-result-title">KI-Ergebnis prüfen</h2><p>Prüfen und korrigieren Sie die erkannten Angaben vor der Übernahme.</p></div><button className="liability-ai-modal__close" type="button" onClick={onClose} aria-label="Dialog schließen">×</button></div>
      <LiabilityLetterForm documentData={aiDraftData} onChange={onChange} headingId="liability-ai-result-form-heading" title="Angaben zum Schreiben" description="Die Daten werden erst nach Ihrer Übernahme in das Schreiben eingefügt." />
      <div className="liability-ai-modal__actions"><button className="button button--secondary" type="button" onClick={onClose}>Abbrechen</button><button className="button" type="button" onClick={onAccept}>Daten übernehmen</button></div>
    </section>
  </div>
}
