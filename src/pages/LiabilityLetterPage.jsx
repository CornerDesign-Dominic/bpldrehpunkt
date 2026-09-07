import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.js'
import LiabilityLetterForm from '../components/templates/LiabilityLetterForm.jsx'
import LiabilityLetterPreview from '../components/templates/LiabilityLetterPreview.jsx'
import LiabilityAiInputModal from '../components/templates/LiabilityAiInputModal.jsx'
import LiabilityAiResultModal from '../components/templates/LiabilityAiResultModal.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import { createLiabilityDocumentData } from '../templates/liabilityDocumentData.js'
import { documentPdfFileName } from '../lib/documentExport.js'
import { downloadLiabilityLetterPdf } from '../lib/liabilityLetterPdf.js'
import { analyzeLiabilityTransportOrderWithAi, liabilityAnalysisToDocumentData } from '../lib/liabilityAi.js'
import { loadCurrentUserSignature, signatureBlobToDataUrl } from '../lib/userSignature.js'

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

function signatureName(profile) {
  return [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim()
}

export default function LiabilityLetterPage() {
  const { profile } = useAuth()
  const [documentData, setDocumentData] = useState(createLiabilityDocumentData)
  const [isCreatingPdf, setCreatingPdf] = useState(false)
  const [aiStep, setAiStep] = useState(null)
  const [aiDraftData, setAiDraftData] = useState(null)
  const [fieldsNeedingReview, setFieldsNeedingReview] = useState(() => new Set())
  const [pdfConfirmationAction, setPdfConfirmationAction] = useState(null)
  const [newDocumentConfirmationOpen, setNewDocumentConfirmationOpen] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [usePersonalSignature, setUsePersonalSignature] = useState(false)
  const [signatureLoading, setSignatureLoading] = useState(false)
  const [signatureNoticeVisible, setSignatureNoticeVisible] = useState(false)
  const documentPaperRef = useRef(null)
  const signaturePreviewUrlRef = useRef('')
  const signatureLoadRequestRef = useRef(0)

  function revokeSignaturePreview() {
    if (signaturePreviewUrlRef.current) URL.revokeObjectURL(signaturePreviewUrlRef.current)
    signaturePreviewUrlRef.current = ''
  }

  function clearPersonalSignature() {
    signatureLoadRequestRef.current += 1
    revokeSignaturePreview()
    setDocumentData((current) => ({ ...current, attachments: { ...current.attachments, signature: null } }))
  }

  useEffect(() => () => {
    signatureLoadRequestRef.current += 1
    revokeSignaturePreview()
  }, [])

  async function loadPersonalSignature() {
    const requestId = ++signatureLoadRequestRef.current
    setSignatureLoading(true)
    try {
      const blob = await loadCurrentUserSignature()
      const imageData = await signatureBlobToDataUrl(blob)
      if (requestId !== signatureLoadRequestRef.current) return false
      revokeSignaturePreview()
      const imageUrl = URL.createObjectURL(blob)
      signaturePreviewUrlRef.current = imageUrl
      setDocumentData((current) => ({ ...current, attachments: { ...current.attachments, signature: { signerName: signatureName(profile), imageUrl, imageData } } }))
      return true
    } catch {
      if (requestId === signatureLoadRequestRef.current) setDocumentData((current) => ({ ...current, attachments: { ...current.attachments, signature: null } }))
      return false
    } finally {
      if (requestId === signatureLoadRequestRef.current) setSignatureLoading(false)
    }
  }

  async function togglePersonalSignature(checked) {
    setUsePersonalSignature(checked)
    setSignatureNoticeVisible(false)
    if (!checked) {
      clearPersonalSignature()
      return
    }
    await loadPersonalSignature()
  }

  async function ensurePersonalSignature() {
    if (!usePersonalSignature) return true
    if (documentData.attachments?.signature?.imageData) return true
    const loaded = await loadPersonalSignature()
    if (!loaded) setSignatureNoticeVisible(true)
    return loaded
  }

  function updateDocumentData(field, value) {
    setDocumentData((current) => ({ ...current, [field]: value }))
  }

  function printDocument() {
    window.print()
  }

  async function requestPdfAction(action) {
    if (!await ensurePersonalSignature()) return
    const emptyFields = emptyAiReviewFields(documentData)
    setFieldsNeedingReview(emptyFields)
    if (emptyFields.size) {
      setPdfConfirmationAction(action)
      return
    }
    if (action === 'print') printDocument()
    else void createPdf()
  }

  async function confirmPdfAction() {
    const action = pdfConfirmationAction
    setPdfConfirmationAction(null)
    if (!await ensurePersonalSignature()) return
    if (action === 'print') printDocument()
    if (action === 'create') void createPdf()
  }

  function resetDocument() {
    signatureLoadRequestRef.current += 1
    revokeSignaturePreview()
    setDocumentData(createLiabilityDocumentData())
    setFieldsNeedingReview(new Set())
    setAiStep(null)
    setAiDraftData(null)
    setUsePersonalSignature(false)
    setSignatureNoticeVisible(false)
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
    const nextDocumentData = { ...createLiabilityDocumentData(), ...aiDraftData, attachments: documentData.attachments }
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
      <div className="liability-page__document-actions"><label className="liability-signature-option"><input type="checkbox" checked={usePersonalSignature} onChange={(event) => { void togglePersonalSignature(event.target.checked) }} disabled={signatureLoading} /><span>Persönliche Unterschrift verwenden</span>{signatureLoading && <small>Unterschrift wird geladen …</small>}</label><div className="liability-page__actions"><button className="button button--secondary" type="button" disabled={signatureLoading} onClick={() => { void requestPdfAction('print') }}>PDF drucken</button><button className="button" type="button" disabled={isCreatingPdf || signatureLoading} aria-busy={isCreatingPdf} onClick={() => { void requestPdfAction('create') }}>PDF erstellen</button></div></div>
      {signatureNoticeVisible && <p className="liability-signature-notice">Du hast noch keine persönliche Unterschrift hinterlegt. Bitte hinterlege deine Unterschrift zuerst unter <Link to="/profil">Mein Profil</Link>.</p>}
      <LiabilityLetterPreview documentData={documentData} paperRef={documentPaperRef} />
      {aiStep === 'input' && <LiabilityAiInputModal isAnalyzing={isAnalyzing} onAnalyze={analyzeTransportOrder} onClose={closeAiFlow} />}
      {aiStep === 'result' && aiDraftData && <LiabilityAiResultModal aiDraftData={aiDraftData} onChange={updateAiDraftData} onClose={closeAiFlow} onAccept={acceptAiDraft} />}
    </div>
  </>
}
