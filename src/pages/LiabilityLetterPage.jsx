import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import LiabilityLetterForm from '../components/templates/LiabilityLetterForm.jsx'
import LiabilityLetterPreview from '../components/templates/LiabilityLetterPreview.jsx'
import LiabilityAiInputModal from '../components/templates/LiabilityAiInputModal.jsx'
import LiabilityAiResultModal from '../components/templates/LiabilityAiResultModal.jsx'
import { createLiabilityDocumentData, createMockLiabilityAiDraftData } from '../templates/liabilityDocumentData.js'
import { documentPdfFileName, downloadDocumentShellPdf } from '../lib/documentExport.js'

export default function LiabilityLetterPage() {
  const [documentData, setDocumentData] = useState(createLiabilityDocumentData)
  const [isCreatingPdf, setCreatingPdf] = useState(false)
  const [aiStep, setAiStep] = useState(null)
  const [aiDraftData, setAiDraftData] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const documentPaperRef = useRef(null)

  function updateDocumentData(field, value) {
    setDocumentData((current) => ({ ...current, [field]: value }))
  }

  function printDocument() {
    window.print()
  }

  async function createPdf() {
    setCreatingPdf(true)
    try {
      await downloadDocumentShellPdf(documentPaperRef.current, documentPdfFileName('Haftbarhaltung_Transportauftrag', documentData.orderNumber))
    } finally {
      setCreatingPdf(false)
    }
  }

  async function analyzeWithMockData() {
    setIsAnalyzing(true)
    await new Promise((resolve) => window.setTimeout(resolve, 700))
    setAiDraftData(createMockLiabilityAiDraftData())
    setAiStep('result')
    setIsAnalyzing(false)
  }

  function updateAiDraftData(field, value) {
    setAiDraftData((current) => ({ ...current, [field]: value }))
  }

  function closeAiFlow() {
    setAiStep(null)
    setAiDraftData(null)
  }

  function acceptAiDraft() {
    setDocumentData(aiDraftData)
    closeAiFlow()
  }

  return <>
    <div className="liability-page__toolbar">
      <Link className="button button--secondary liability-page__back" to="/vorlagen">← Zurück</Link>
      <button className="button button--ai" type="button" onClick={() => setAiStep('input')}>Mit KI vorausfüllen</button>
    </div>
    <div className="liability-page">
      <div className="liability-page__header"><div><h2>Haftbarhaltung</h2></div></div>
      <LiabilityLetterForm documentData={documentData} onChange={updateDocumentData} />
      <div className="liability-page__actions"><button className="button button--secondary" type="button" onClick={printDocument}>PDF drucken</button><button className="button" type="button" disabled={isCreatingPdf} aria-busy={isCreatingPdf} onClick={() => { void createPdf() }}>PDF erstellen</button></div>
      <LiabilityLetterPreview documentData={documentData} paperRef={documentPaperRef} />
      {aiStep === 'input' && <LiabilityAiInputModal isAnalyzing={isAnalyzing} onAnalyze={() => { void analyzeWithMockData() }} onClose={closeAiFlow} />}
      {aiStep === 'result' && aiDraftData && <LiabilityAiResultModal aiDraftData={aiDraftData} onChange={updateAiDraftData} onClose={closeAiFlow} onAccept={acceptAiDraft} />}
    </div>
  </>
}
