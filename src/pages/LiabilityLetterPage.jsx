import { useState } from 'react'
import { Link } from 'react-router-dom'
import LiabilityLetterForm from '../components/templates/LiabilityLetterForm.jsx'
import LiabilityLetterPreview from '../components/templates/LiabilityLetterPreview.jsx'
import { createLiabilityDocumentData } from '../templates/liabilityDocumentData.js'

export default function LiabilityLetterPage() {
  const [documentData, setDocumentData] = useState(createLiabilityDocumentData)

  function updateDocumentData(field, value) {
    setDocumentData((current) => ({ ...current, [field]: value }))
  }

  function printDocument() {
    window.print()
  }

  function createPdf() {
    const previousTitle = window.document.title
    const suffix = documentData.orderNumber ? ` ${documentData.orderNumber}` : ''
    window.document.title = `Haftbarhaltung${suffix}`
    window.print()
    window.document.title = previousTitle
  }

  return <div className="liability-page">
    <div className="liability-page__header"><div><Link className="liability-page__back" to="/vorlagen">← Vorlagen</Link><h2>Haftbarhaltung</h2><p>Erstellen Sie ein Schreiben auf Basis des jeweiligen Transportauftrags.</p></div><div className="liability-page__actions"><button className="button button--secondary" type="button" onClick={printDocument}>Drucken</button><button className="button" type="button" onClick={createPdf}>PDF erstellen</button></div></div>
    <LiabilityLetterForm documentData={documentData} onChange={updateDocumentData} />
    <section className="template-preview-section" aria-labelledby="liability-preview-heading"><div className="template-section-heading"><div><h2 id="liability-preview-heading">Dokumentvorschau</h2><p>A4-Vorschau · Die Druckansicht entspricht diesem Schreiben.</p></div></div><LiabilityLetterPreview documentData={documentData} /></section>
  </div>
}
