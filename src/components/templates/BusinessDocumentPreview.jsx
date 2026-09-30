import DocumentShell from '../documents/DocumentShell.jsx'
import { businessDocumentRecipientLines, formatBusinessDocumentDate } from '../../templates/businessDocumentData.js'
import { useCompanyData } from '../../company/companyDataContext.js'
import { documentSignature } from '../../templates/documentSignature.js'

function Recipient({ documentData }) {
  const lines = businessDocumentRecipientLines(documentData)
  return <>{lines.map((line, index) => <span key={`${line}-${index}`}>{line}{index < lines.length - 1 && <br />}</span>)}</>
}

export default function BusinessDocumentPreview({ documentData, paperRef }) {
  const { company } = useCompanyData()
  const subject = documentData.subject.trim()
  const content = documentData.content.trim()
  const personalSignature = documentSignature(documentData)
  return <DocumentShell label="Dokumentvorschau Geschäftsdokument" paperRef={paperRef} recipient={<Recipient documentData={documentData} />} recipientMeta={<time dateTime={documentData.date}>{formatBusinessDocumentDate(documentData.date)}</time>}>
    <main className="business-document__content">
      <h2>{subject || <span className="business-document__empty">Betreff</span>}</h2>
      <p className={content ? '' : 'business-document__empty'}>{content || 'Der Inhalt Ihres Geschäftsdokuments erscheint hier.'}</p>
      <div className="document-signature-block">{personalSignature ? <div className="document-signature-block__personal"><strong>{personalSignature.signerName}</strong><img src={personalSignature.imageUrl} alt={`Persönliche Unterschrift von ${personalSignature.signerName}`} /></div> : <strong>{company.legalName}</strong>}{documentData.attachments?.stamp?.imageUrl && <img className="document-signature-block__stamp" src={documentData.attachments.stamp.imageUrl} alt="Firmenstempel" />}</div>
    </main>
  </DocumentShell>
}
