import { liabilityStopNeedsReview } from '../templates/liabilityLetterContent.js'
import LiabilityOrderPicker from '../components/templates/LiabilityOrderPicker.jsx'
import LiabilityStopSelection from '../components/templates/LiabilityStopSelection.jsx'
import { useLanguage } from '../i18n/useLanguage.js'
import { StaticText, TranslatedProps } from '../i18n/AutoTranslate.jsx'
import { useRef, useState } from 'react'
import LiabilityLetterForm from '../components/templates/LiabilityLetterForm.jsx'
import LiabilityLetterPreview from '../components/templates/LiabilityLetterPreview.jsx'
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
  const { language } = useLanguage()
  const w = (de, en) => language === 'en' ? en : de
  const [documentVersion, setDocumentVersion] = useState(0)
  const [orderActivity, setOrderActivity] = useState(null)
  const [orderRevision, setOrderRevision] = useState(0)
  const orderBusy = Boolean(orderActivity)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [pendingOrder, setPendingOrder] = useState(null)
  const { company, loading: companyLoading, error: companyError } = useCompanyData()
  const [documentData, setDocumentData] = useState(createLiabilityDocumentData)
  const [isCreatingPdf, setCreatingPdf] = useState(false)
  const [isPrintingPdf, setPrintingPdf] = useState(false)
  const [pdfError, setPdfError] = useState('')
  const [fieldsNeedingReview, setFieldsNeedingReview] = useState(() => new Set())
  const [pdfConfirmationAction, setPdfConfirmationAction] = useState(null)
  const [newDocumentConfirmationOpen, setNewDocumentConfirmationOpen] = useState(false)
  const documentPaperRef = useRef(null)
  const { usePersonalSignature, signatureLoading, signatureNoticeVisible, signatureNoticeMessage, signatureMissing, togglePersonalSignature, ensurePersonalSignature, resetPersonalSignature } = usePersonalDocumentSignature(setDocumentData)
  const stamp = useCompanyStamp(setDocumentData)

  function updateDocumentData(field, value) {
    setPdfError('')
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
    if (orderBusy || companyLoading || companyError || stamp.loading) return
    if (!await ensurePersonalSignature(documentData)) return
    const emptyFields = emptyAiReviewFields(documentData)
    if (Array.isArray(documentData.selectedStops)) {
      for (const field of [...emptyFields]) if (field.startsWith('loading') || field.startsWith('unloading')) emptyFields.delete(field)
      if (!documentData.selectedStops.length) { setPdfError(w('Bitte mindestens eine betroffene Stelle auswählen.', 'Please select at least one affected location.')); return }
      if (documentData.selectedStops.some(liabilityStopNeedsReview)) emptyFields.add('selectedStops')
    }
    if (!documentData.date) emptyFields.add('date')
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
    setPdfError('')
    setDocumentVersion(value => value + 1)
    setSelectedOrder(null)
    setPendingOrder(null)
    resetPersonalSignature()
    stamp.reset()
    setDocumentData(createLiabilityDocumentData())
    setFieldsNeedingReview(new Set())
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

  function applyOrder(order) {
    setOrderRevision(value => value + 1)
    const selectedStops = order.stops.length && order.stops.filter(stop => order.stops.filter(item => item.type === stop.type).length === 1).map(stop => ({ ...stop }))
    const orderFields = { orderNumber: order.externalNumber,
      transportCompany: order.carrier.company || '', transportStreet: order.carrier.street || '',
      transportZip: order.carrier.postalCode || '', transportCity: order.carrier.city || '', transportCountry: order.carrier.country || '',
      selectedStops: order.stops.length ? selectedStops : null,
      ...Object.fromEntries(liabilityFormFields.filter(field => field.startsWith('loading') || field.startsWith('unloading')).map(field => [field, ''])),
    }
    setDocumentData(current => ({ ...current, ...orderFields }))
    setSelectedOrder(order)
    setFieldsNeedingReview(new Set(Object.entries(orderFields).filter(([field, value]) => field !== 'selectedStops' && !String(value || '').trim()).map(([field]) => field)))
    setPdfError('')
    setPendingOrder(null)
  }

  function chooseOrder(order) {
    if (selectedOrder || liabilityFormFields.some(field => field !== 'incidentText' && String(documentData[field] || '').trim())) setPendingOrder(order)
    else applyOrder(order)
  }

  const hasMissingOrderData = selectedOrder && (['transportCompany', 'transportStreet', 'transportZip', 'transportCity', 'transportCountry'].some(field => !String(documentData[field] || '').trim()) || (Array.isArray(documentData.selectedStops) ? documentData.selectedStops.some(liabilityStopNeedsReview) : true))

  return <>
    <ConfirmDialog open={Boolean(pendingOrder)} title={w('Auftragsdaten übernehmen?', 'Use order details?')} message={w('Die bisherigen Auftrags- und Adressangaben sowie die Stellenauswahl werden ersetzt. Belegdatum, Sachverhalt und Unterschrift/Stempel bleiben erhalten.', 'This replaces the order details, addresses and location selection. The document date, description, signature and stamp are preserved.')} confirmLabel={w('Übernehmen', 'Use details')} onCancel={() => setPendingOrder(null)} onConfirm={() => applyOrder(pendingOrder)} />
    <TranslatedProps sources={{"title":"Unvollständige Angaben"}}><ConfirmDialog open={Boolean(pdfConfirmationAction)} title="Unvollständige Angaben" message="Nicht alle Felder sind ausgefüllt. Möchtest du die PDF trotzdem erzeugen?" confirmLabel="Trotzdem erzeugen" onCancel={() => setPdfConfirmationAction(null)} onConfirm={confirmPdfAction} /></TranslatedProps>
    <TranslatedProps sources={{"title":"Neue Haftbarhaltung erstellen?"}}><ConfirmDialog open={newDocumentConfirmationOpen} title="Neue Haftbarhaltung erstellen?" message="Alle eingegebenen Daten werden geleert." confirmLabel="Neu erstellen" onCancel={() => setNewDocumentConfirmationOpen(false)} onConfirm={confirmNewDocument} /></TranslatedProps>
    <div className="liability-page__toolbar">
      <BackLink className="liability-page__back" to="/vorlagen" />

    </div>
    <div className="liability-page">
      <div className="liability-page__header"><div><h2><StaticText source={"Haftbarhaltung"} /></h2></div></div>
      <LiabilityOrderPicker key={`picker-${documentVersion}`} onActivityChange={setOrderActivity} onSelect={chooseOrder} onImported={applyOrder} />
      <LiabilityLetterForm key={`form-${documentVersion}`} title={w('Transportdaten für das Dokument', 'Transport details for the document')} hideStops={Array.isArray(documentData.selectedStops)} enableWording documentData={documentData} onChange={updateDocumentData} aiReviewFields={fieldsNeedingReview} onNew={orderBusy ? undefined : requestNewDocument} orderActivity={orderActivity} orderContent={<>
        {hasMissingOrderData && <p className="liability-data-warning" role="status">{w('Die Auftragsdaten sind unvollständig. Bitte fehlende Anschriften oder Termine ergänzen und die übernommenen Angaben prüfen.', 'The order data is incomplete. Please add missing addresses or dates and review the imported details.')}</p>}
        {selectedOrder && <LiabilityStopSelection key={`stops-${documentVersion}-${orderRevision}`} order={selectedOrder} selectedStops={documentData.selectedStops || []} onChange={value => updateDocumentData('selectedStops', value)} />}
      </>} />
      <div className="liability-page__document-actions">
        <div className="document-signature-settings">
          <PersonalSignatureOption usePersonalSignature={usePersonalSignature} signatureLoading={signatureLoading} signatureNoticeVisible={signatureNoticeVisible} signatureNoticeMessage={signatureNoticeMessage} signatureMissing={signatureMissing} onToggle={togglePersonalSignature} />
          <CompanyStampOption stamp={stamp} />
        </div>
        {companyError && <p className="form-error" role="alert">{companyError}</p>}
        {pdfError && <p className="form-error" role="alert">{pdfError}</p>}
        <div className="liability-page__actions">
          <button className="button button--secondary" type="button" disabled={orderBusy || isPrintingPdf || signatureLoading || stamp.loading || companyLoading || Boolean(companyError)} aria-busy={isPrintingPdf} onClick={() => { void requestPdfAction('print') }}><StaticText source={"PDF drucken"} /></button>
          <button className="button" type="button" disabled={orderBusy || isCreatingPdf || isPrintingPdf || signatureLoading || stamp.loading || companyLoading || Boolean(companyError)} aria-busy={isCreatingPdf} onClick={() => { void requestPdfAction('create') }}><StaticText source={"PDF erstellen"} /></button>
        </div>
      </div>
      <LiabilityLetterPreview documentData={documentData} paperRef={documentPaperRef} />
    </div>
  </>
}
