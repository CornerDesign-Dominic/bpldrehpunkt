import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import BusinessDocumentForm from '../components/templates/BusinessDocumentForm.jsx'
import BusinessDocumentPreview from '../components/templates/BusinessDocumentPreview.jsx'
import PersonalSignatureOption from '../components/templates/PersonalSignatureOption.jsx'
import { usePersonalDocumentSignature } from '../hooks/usePersonalDocumentSignature.js'
import { documentPdfFileName } from '../lib/documentExport.js'
import { downloadBusinessDocumentPdf } from '../lib/businessDocumentPdf.js'
import { createBusinessDocumentData } from '../templates/businessDocumentData.js'

export default function BusinessDocumentPage() {
  const [documentData, setDocumentData] = useState(createBusinessDocumentData)
  const [isCreatingPdf, setCreatingPdf] = useState(false)
  const documentPaperRef = useRef(null)
  const { usePersonalSignature, signatureLoading, signatureNoticeVisible, togglePersonalSignature, ensurePersonalSignature } = usePersonalDocumentSignature(setDocumentData)

  function updateDocumentData(field, value) {
    setDocumentData((current) => ({ ...current, [field]: value }))
  }

  async function createPdf() {
    setCreatingPdf(true)
    try {
      await downloadBusinessDocumentPdf(documentData, documentPdfFileName('Geschaeftsdokument', documentData.subject))
    } finally {
      setCreatingPdf(false)
    }
  }

  async function requestPdfAction(action) {
    if (!await ensurePersonalSignature(documentData)) return
    if (action === 'print') window.print()
    else void createPdf()
  }

  return <>
    <div className="liability-page__toolbar"><Link className="button button--secondary liability-page__back" to="/vorlagen">Zurück</Link></div>
    <div className="liability-page">
      <div className="liability-page__header"><div><h2>Geschäftsdokument</h2></div></div>
      <BusinessDocumentForm documentData={documentData} onChange={updateDocumentData} />
      <div className="liability-page__document-actions">
        <PersonalSignatureOption usePersonalSignature={usePersonalSignature} signatureLoading={signatureLoading} signatureNoticeVisible={signatureNoticeVisible} onToggle={togglePersonalSignature} />
        <div className="liability-page__actions">
          <button className="button button--secondary" type="button" disabled={signatureLoading} onClick={() => { void requestPdfAction('print') }}>PDF drucken</button>
          <button className="button" type="button" disabled={isCreatingPdf || signatureLoading} aria-busy={isCreatingPdf} onClick={() => { void requestPdfAction('create') }}>PDF erstellen</button>
        </div>
      </div>
      <BusinessDocumentPreview documentData={documentData} paperRef={documentPaperRef} />
    </div>
  </>
}
