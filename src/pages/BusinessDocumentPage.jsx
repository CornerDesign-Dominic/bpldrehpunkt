import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import BusinessDocumentForm from '../components/templates/BusinessDocumentForm.jsx'
import BusinessDocumentPreview from '../components/templates/BusinessDocumentPreview.jsx'
import { documentPdfFileName } from '../lib/documentExport.js'
import { downloadBusinessDocumentPdf } from '../lib/businessDocumentPdf.js'
import { createBusinessDocumentData } from '../templates/businessDocumentData.js'

export default function BusinessDocumentPage() {
  const [documentData, setDocumentData] = useState(createBusinessDocumentData)
  const [isCreatingPdf, setCreatingPdf] = useState(false)
  const documentPaperRef = useRef(null)

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

  return <>
    <div className="liability-page__toolbar"><Link className="button button--secondary liability-page__back" to="/vorlagen">Zurück</Link></div>
    <div className="liability-page">
      <div className="liability-page__header"><div><h2>Geschäftsdokument</h2></div></div>
      <BusinessDocumentForm documentData={documentData} onChange={updateDocumentData} />
      <div className="liability-page__actions"><button className="button button--secondary" type="button" onClick={() => window.print()}>PDF drucken</button><button className="button" type="button" disabled={isCreatingPdf} aria-busy={isCreatingPdf} onClick={() => { void createPdf() }}>PDF erstellen</button></div>
      <BusinessDocumentPreview documentData={documentData} paperRef={documentPaperRef} />
    </div>
  </>
}
