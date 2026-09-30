import { useRef, useState } from 'react'
import BusinessDocumentForm from '../components/templates/BusinessDocumentForm.jsx'
import BusinessDocumentPreview from '../components/templates/BusinessDocumentPreview.jsx'
import PersonalSignatureOption from '../components/templates/PersonalSignatureOption.jsx'
import CompanyStampOption from '../components/templates/CompanyStampOption.jsx'
import { useCompanyData } from '../company/companyDataContext.js'
import BackLink from '../components/ui/BackLink.jsx'
import { usePersonalDocumentSignature } from '../hooks/usePersonalDocumentSignature.js'
import { useCompanyStamp } from '../hooks/useCompanyStamp.js'
import { documentPdfFileName } from '../lib/documentExport.js'
import { downloadBusinessDocumentPdf } from '../lib/businessDocumentPdf.js'
import { reportTechnicalFailure } from '../lib/diagnostics.js'
import { createBusinessDocumentData } from '../templates/businessDocumentData.js'

export default function BusinessDocumentPage() {
  const { company, loading: companyLoading, error: companyError } = useCompanyData()
  const [documentData, setDocumentData] = useState(createBusinessDocumentData)
  const [isCreatingPdf, setCreatingPdf] = useState(false)
  const [pdfError, setPdfError] = useState('')
  const documentPaperRef = useRef(null)
  const { usePersonalSignature, signatureLoading, signatureNoticeVisible, signatureNoticeMessage, signatureMissing, togglePersonalSignature, ensurePersonalSignature } = usePersonalDocumentSignature(setDocumentData)
  const stamp = useCompanyStamp(setDocumentData)

  function updateDocumentData(field, value) {
    setDocumentData((current) => ({ ...current, [field]: value }))
  }

  async function createPdf() {
    setCreatingPdf(true)
    setPdfError('')
    try {
      await downloadBusinessDocumentPdf(documentData, documentPdfFileName('Geschaeftsdokument', documentData.subject), company)
    } catch (error) {
      setPdfError('Die PDF konnte nicht erstellt werden. Bitte versuche es erneut.')
      void reportTechnicalFailure({ module: 'document-templates', stage: 'pdf-create', error })
    } finally {
      setCreatingPdf(false)
    }
  }

  async function requestPdfAction(action) {
    if (companyLoading || companyError || stamp.loading) return
    if (!await ensurePersonalSignature(documentData)) return
    if (action === 'print') window.print()
    else void createPdf()
  }

  return <>
    <div className="liability-page__toolbar"><BackLink className="liability-page__back" to="/vorlagen" /></div>
    <div className="liability-page">
      <div className="liability-page__header"><div><h2>Geschäftsdokument</h2></div></div>
      <BusinessDocumentForm documentData={documentData} onChange={updateDocumentData} />
      <div className="liability-page__document-actions">
        <div className="document-signature-settings">
          <PersonalSignatureOption usePersonalSignature={usePersonalSignature} signatureLoading={signatureLoading} signatureNoticeVisible={signatureNoticeVisible} signatureNoticeMessage={signatureNoticeMessage} signatureMissing={signatureMissing} onToggle={togglePersonalSignature} />
          <CompanyStampOption stamp={stamp} />
        </div>
        {companyError && <p className="form-error" role="alert">{companyError}</p>}
        {pdfError && <p className="form-error" role="alert">{pdfError}</p>}
        <div className="liability-page__actions">
          <button className="button button--secondary" type="button" disabled={signatureLoading || stamp.loading || companyLoading || Boolean(companyError)} onClick={() => { void requestPdfAction('print') }}>PDF drucken</button>
          <button className="button" type="button" disabled={isCreatingPdf || signatureLoading || stamp.loading || companyLoading || Boolean(companyError)} aria-busy={isCreatingPdf} onClick={() => { void requestPdfAction('create') }}>PDF erstellen</button>
        </div>
      </div>
      <BusinessDocumentPreview documentData={documentData} paperRef={documentPaperRef} />
    </div>
  </>
}
