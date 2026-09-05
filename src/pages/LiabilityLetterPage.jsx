import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import LiabilityLetterForm from '../components/templates/LiabilityLetterForm.jsx'
import LiabilityLetterPreview from '../components/templates/LiabilityLetterPreview.jsx'
import { createLiabilityDocumentData } from '../templates/liabilityDocumentData.js'
import { documentPdfFileName, downloadDocumentShellPdf } from '../lib/documentExport.js'

export default function LiabilityLetterPage() {
  const [documentData, setDocumentData] = useState(createLiabilityDocumentData)
  const [isCreatingPdf, setCreatingPdf] = useState(false)
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

  return <div className="liability-page">
    <Link className="button button--secondary liability-page__back" to="/vorlagen">← Zurück</Link>
    <div className="liability-page__header"><div><h2>Haftbarhaltung</h2></div></div>
    <LiabilityLetterForm documentData={documentData} onChange={updateDocumentData} />
    <div className="liability-page__actions"><button className="button button--secondary" type="button" onClick={printDocument}>PDF drucken</button><button className="button" type="button" disabled={isCreatingPdf} aria-busy={isCreatingPdf} onClick={() => { void createPdf() }}>PDF erstellen</button></div>
    <LiabilityLetterPreview documentData={documentData} paperRef={documentPaperRef} />
  </div>
}
