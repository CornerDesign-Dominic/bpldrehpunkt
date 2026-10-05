import { StaticText, TranslatedProps } from '../i18n/AutoTranslate.jsx'
import { useRef, useState } from 'react'
import LiabilityLetterForm from '../components/templates/LiabilityLetterForm.jsx'
import LiabilityLetterPreview from '../components/templates/LiabilityLetterPreview.jsx'
import LiabilityAiInputModal from '../components/templates/LiabilityAiInputModal.jsx'
import LiabilityAiResultModal from '../components/templates/LiabilityAiResultModal.jsx'
import PersonalSignatureOption from '../components/templates/PersonalSignatureOption.jsx'
import CompanyStampOption from '../components/templates/CompanyStampOption.jsx'
import { useCompanyData } from '../company/companyDataContext.js'
import BackLink from '../components/ui/BackLink.jsx'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import { usePersonalDocumentSignature } from '../hooks/usePersonalDocumentSignature.js'
import { useCompanyStamp } from '../hooks/useCompanyStamp.js'
import { createLiabilityDocumentData } from '../templates/liabilityDocumentData.js'
import { documentPdfFileName } from '../lib/documentExport.js'
import { downloadLiabilityLetterPdf, printLiabilityLetterPdf } from '../lib/liabilityLetterPdf.js'
import { reportTechnicalFailure } from '../lib/diagnostics.js'
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
  const { company, loading: companyLoading, error: companyError } = useCompanyData()
  const [documentData, setDocumentData] = useState(createLiabilityDocumentData)
  const [isCreatingPdf, setCreatingPdf] = useState(false)
  const [isPrintingPdf, setPrintingPdf] = useState(false)
  const [pdfError, setPdfError] = useState('')
  const [aiStep, setAiStep] = useState(null)
  const [aiDraftData, setAiDraftData] = useState(null)
  const [fieldsNeedingReview, setFieldsNeedingReview] = useState(() => new Set())
  const [pdfConfirmationAction, setPdfConfirmationAction] = useState(null)
  const [newDocumentConfirmationOpen, setNewDocumentConfirmationOpen] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const documentPaperRef = useRef(null)
  const { usePersonalSignature, signatureLoading, signatureNoticeVisible, signatureNoticeMessage, signatureMissing, togglePersonalSignature, ensurePersonalSignature, resetPersonalSignature } = usePersonalDocumentSignature(setDocumentData)
  const stamp = useCompanyStamp(setDocumentData)

  function updateDocumentData(field, value) {
    setDocumentData((current) => ({ ...current, [field]: value }))
  }

  async function printDocument() {
    setPrintingPdf(true)
    setPdfError('')
    try {
      await printLiabilityLetterPdf(documentData, company)
    } catch (error) {
      setPdfError('Die Druckansicht konnte nicht vorbereitet werden. Bitte versuche es erneut.')
      void reportTechnicalFailure({ module: 'document-templates', stage: 'pdf-print', error })
    } finally {
      setPrintingPdf(false)
    }
  }

  async function requestPdfAction(action) {
    if (companyLoading || companyError || stamp.loading) return
    if (!await ensurePersonalSignature(documentData)) return
    const emptyFields = emptyAiReviewFields(documentData)
    setFieldsNeedingReview(emptyFields)
    if (emptyFields.size) {
      setPdfConfirmationAction(action)
      return
    }
    if (action === 'print') await printDocument()
    else void createPdf()
  }

  async function confirmPdfAction() {
    const action = pdfConfirmationAction
    setPdfConfirmationAction(null)
    if (!await ensurePersonalSignature(documentData)) return
    if (action === 'print') await printDocument()
    if (action === 'create') void createPdf()
  }

  function resetDocument() {
    resetPersonalSignature()
    stamp.reset()
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
    setPdfError('')
    try {
      await downloadLiabilityLetterPdf(documentData, documentPdfFileName('Haftbarhaltung_Transportauftrag', documentData.orderNumber), company)
    } catch (error) {
      setPdfError('Die PDF konnte nicht erstellt werden. Bitte versuche es erneut.')
      void reportTechnicalFailure({ module: 'document-templates', stage: 'pdf-create', error })
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
    <TranslatedProps sources={{"title":"Unvollständige Angaben"}}><ConfirmDialog open={Boolean(pdfConfirmationAction)} title="Unvollständige Angaben" message="Nicht alle Felder sind ausgefüllt. Möchtest du die PDF trotzdem erzeugen?" confirmLabel="Trotzdem erzeugen" onCancel={() => setPdfConfirmationAction(null)} onConfirm={confirmPdfAction} /></TranslatedProps>
    <TranslatedProps sources={{"title":"Neue Haftbarhaltung erstellen?"}}><ConfirmDialog open={newDocumentConfirmationOpen} title="Neue Haftbarhaltung erstellen?" message="Alle eingegebenen Daten werden geleert." confirmLabel="Neu erstellen" onCancel={() => setNewDocumentConfirmationOpen(false)} onConfirm={confirmNewDocument} /></TranslatedProps>
    <div className="liability-page__toolbar">
      <BackLink className="liability-page__back" to="/vorlagen" />
      <button className="button button--ai" type="button" onClick={() => setAiStep('input')}><StaticText source={"Mit KI vorausfüllen"} /></button>
    </div>
    <div className="liability-page">
      <div className="liability-page__header"><div><h2><StaticText source={"Haftbarhaltung"} /></h2></div></div>
      <LiabilityLetterForm documentData={documentData} onChange={updateDocumentData} aiReviewFields={fieldsNeedingReview} onNew={requestNewDocument} />
      <div className="liability-page__document-actions">
        <div className="document-signature-settings">
          <PersonalSignatureOption usePersonalSignature={usePersonalSignature} signatureLoading={signatureLoading} signatureNoticeVisible={signatureNoticeVisible} signatureNoticeMessage={signatureNoticeMessage} signatureMissing={signatureMissing} onToggle={togglePersonalSignature} />
          <CompanyStampOption stamp={stamp} />
        </div>
        {companyError && <p className="form-error" role="alert">{companyError}</p>}
        {pdfError && <p className="form-error" role="alert">{pdfError}</p>}
        <div className="liability-page__actions">
          <button className="button button--secondary" type="button" disabled={isPrintingPdf || signatureLoading || stamp.loading || companyLoading || Boolean(companyError)} aria-busy={isPrintingPdf} onClick={() => { void requestPdfAction('print') }}><StaticText source={"PDF drucken"} /></button>
          <button className="button" type="button" disabled={isCreatingPdf || isPrintingPdf || signatureLoading || stamp.loading || companyLoading || Boolean(companyError)} aria-busy={isCreatingPdf} onClick={() => { void requestPdfAction('create') }}><StaticText source={"PDF erstellen"} /></button>
        </div>
      </div>
      <LiabilityLetterPreview documentData={documentData} paperRef={documentPaperRef} />
      {aiStep === 'input' && <LiabilityAiInputModal isAnalyzing={isAnalyzing} onAnalyze={analyzeTransportOrder} onClose={closeAiFlow} />}
      {aiStep === 'result' && aiDraftData && <LiabilityAiResultModal aiDraftData={aiDraftData} onChange={updateAiDraftData} onClose={closeAiFlow} onAccept={acceptAiDraft} />}
    </div>
  </>
}
