import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import LiabilityLetterForm from '../components/templates/LiabilityLetterForm.jsx'
import LiabilityLetterPreview from '../components/templates/LiabilityLetterPreview.jsx'
import LiabilityAiInputModal from '../components/templates/LiabilityAiInputModal.jsx'
import LiabilityAiResultModal from '../components/templates/LiabilityAiResultModal.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import { createLiabilityDocumentData } from '../templates/liabilityDocumentData.js'
import { documentPdfFileName } from '../lib/documentExport.js'
import { downloadLiabilityLetterPdf } from '../lib/liabilityLetterPdf.js'
import { analyzeLiabilityTransportOrderWithAi, liabilityAnalysisToDocumentData } from '../lib/liabilityAi.js'

const liabilityFormFields = [
  'orderNumber',
  'transportCompany', 'transportStreet', 'transportZip', 'transportCity', 'transportCountry',
  'loadingCompany', 'loadingStreet', 'loadingZip', 'loadingCity', 'loadingCountry', 'loadingDate',
  'unloadingCompany', 'unloadingStreet', 'unloadingZip', 'unloadingCity', 'unloadingCountry', 'unloadingDate',
  'incidentText',
]

function emptyAiReviewFields(data) {
  return new Set(liabilityFormFields.filter((field) => !String(data?.[field] ?? '').trim()))
}

function hasLiabilityFormValues(data) {
  return liabilityFormFields.some((field) => String(data?.[field] ?? '').trim())
}

export default function LiabilityLetterPage() {
  const [documentData, setDocumentData] = useState(createLiabilityDocumentData)
  const [isCreatingPdf, setCreatingPdf] = useState(false)
  const [aiStep, setAiStep] = useState(null)
  const [aiDraftData, setAiDraftData] = useState(null)
  const [fieldsNeedingReview, setFieldsNeedingReview] = useState(() => new Set())
  const [pdfConfirmationAction, setPdfConfirmationAction] = useState(null)
  const [newDocumentConfirmationOpen, setNewDocumentConfirmationOpen] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const documentPaperRef = useRef(null)

  function updateDocumentData(field, value) {
    setDocumentData((current) => ({ ...current, [field]: value }))
  }

  function printDocument() {
    window.print()
  }

  function requestPdfAction(action) {
    const emptyFields = emptyAiReviewFields(documentData)
    setFieldsNeedingReview(emptyFields)
    if (emptyFields.size) {
      setPdfConfirmationAction(action)
      return
    }
    if (action === 'print') printDocument()
    else void createPdf()
  }

  function confirmPdfAction() {
    const action = pdfConfirmationAction
    setPdfConfirmationAction(null)
    if (action === 'print') printDocument()
    if (action === 'create') void createPdf()
  }

  function resetDocument() {
    setDocumentData(createLiabilityDocumentData())
    setFieldsNeedingReview(new Set())
    setAiStep(null)
    setAiDraftData(null)
  }

  function requestNewDocument() {
    if (hasLiabilityFormValues(documentData)) {
      setNewDocumentConfirmationOpen(true)
      return
    }
    resetDocument()
  }

  function confirmNewDocument() {
    setNewDocumentConfirmationOpen(false)
    resetDocument()
  }

  async function createPdf() {
    setCreatingPdf(true)
    try {
      await downloadLiabilityLetterPdf(documentData, documentPdfFileName('Haftbarhaltung_Transportauftrag', documentData.orderNumber))
    } finally {
      setCreatingPdf(false)
    }
  }

  async function analyzeTransportOrder({ file, incidentSummary }) {
    setIsAnalyzing(true)
    try {
      const analysis = await analyzeLiabilityTransportOrderWithAi(file, incidentSummary)
      setAiDraftData({ ...createLiabilityDocumentData(), ...liabilityAnalysisToDocumentData(analysis) })
      setAiStep('result')
    } finally {
      setIsAnalyzing(false)
    }
  }

  function updateAiDraftData(field, value) {
    setAiDraftData((current) => ({ ...current, [field]: value }))
  }

  function closeAiFlow() {
    setAiStep(null)
    setAiDraftData(null)
  }

  function acceptAiDraft() {
    const nextDocumentData = { ...createLiabilityDocumentData(), ...aiDraftData }
    setDocumentData(nextDocumentData)
    setFieldsNeedingReview(emptyAiReviewFields(nextDocumentData))
    closeAiFlow()
  }

  return <>
    <ConfirmDialog open={Boolean(pdfConfirmationAction)} title="Unvollständige Angaben" message="Nicht alle Felder sind ausgefüllt. Möchtest du die PDF trotzdem erzeugen?" confirmLabel="Trotzdem erzeugen" onCancel={() => setPdfConfirmationAction(null)} onConfirm={confirmPdfAction} />
    <ConfirmDialog open={newDocumentConfirmationOpen} title="Neue Haftbarhaltung erstellen?" message="Alle eingegebenen Daten werden geleert." confirmLabel="Neu erstellen" onCancel={() => setNewDocumentConfirmationOpen(false)} onConfirm={confirmNewDocument} />
    <div className="liability-page__toolbar">
      <Link className="button button--secondary liability-page__back" to="/vorlagen">Zurück</Link>
      <button className="button button--ai" type="button" onClick={() => setAiStep('input')}>Mit KI vorausfüllen</button>
    </div>
    <div className="liability-page">
      <div className="liability-page__header"><div><h2>Haftbarhaltung</h2></div></div>
      <LiabilityLetterForm documentData={documentData} onChange={updateDocumentData} aiReviewFields={fieldsNeedingReview} onNew={requestNewDocument} />
      <div className="liability-page__actions"><button className="button button--secondary" type="button" onClick={() => requestPdfAction('print')}>PDF drucken</button><button className="button" type="button" disabled={isCreatingPdf} aria-busy={isCreatingPdf} onClick={() => requestPdfAction('create')}>PDF erstellen</button></div>
      <LiabilityLetterPreview documentData={documentData} paperRef={documentPaperRef} />
      {aiStep === 'input' && <LiabilityAiInputModal isAnalyzing={isAnalyzing} onAnalyze={analyzeTransportOrder} onClose={closeAiFlow} />}
      {aiStep === 'result' && aiDraftData && <LiabilityAiResultModal aiDraftData={aiDraftData} onChange={updateAiDraftData} onClose={closeAiFlow} onAccept={acceptAiDraft} />}
    </div>
  </>
}
