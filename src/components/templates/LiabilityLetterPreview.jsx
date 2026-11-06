import DocumentShell from '../documents/DocumentShell.jsx'
import { formatDocumentDate, getLiabilitySubject } from '../../templates/liabilityDocumentData.js'
import { liabilityDocumentLocations, LIABILITY_LETTER_TEXT } from '../../templates/liabilityLetterContent.js'
import { documentSignature } from '../../templates/documentSignature.js'
import { useCompanyData } from '../../company/companyDataContext.js'

function Value({ children, placeholder = '—' }) {
  return <span className={children ? '' : 'liability-document__empty'}>{children || placeholder}</span>
}

function Address({ company, street, zip, city, country }) {
  const place = [zip, city].filter(Boolean).join(' ')
  return <><Value>{company}</Value><br /><Value>{street}</Value><br /><Value>{place}</Value><br /><Value>{country}</Value></>
}

export default function LiabilityLetterPreview({ documentData, paperRef }) {
  const { company } = useCompanyData()
  const { orderNumber, transportCompany, transportStreet, transportZip, transportCity, transportCountry, date, incidentText } = documentData
  const locations = liabilityDocumentLocations(documentData)
  const personalSignature = documentSignature(documentData)
  return <DocumentShell label="Dokumentvorschau Haftbarhaltung" paperRef={paperRef} recipient={<Address company={transportCompany} street={transportStreet} zip={transportZip} city={transportCity} country={transportCountry} />} recipientMeta={<time dateTime={date}>{formatDocumentDate(date)}</time>}>
    <main className="liability-document__content">
      <h2>{getLiabilitySubject(orderNumber)}</h2>
      <p>{LIABILITY_LETTER_TEXT.salutation}</p>
      <p>{LIABILITY_LETTER_TEXT.introduction}</p>
      {locations.length > 0 && <div className="liability-document__locations">{locations.map((location) => <p key={location.id}>{location.heading}<br /><Value placeholder="">{location.address}</Value></p>)}</div>}
      {incidentText?.trim() && <p>{incidentText}</p>}
      <p>{LIABILITY_LETTER_TEXT.reservation}</p>
      <p>{LIABILITY_LETTER_TEXT.insuranceNotice}</p>
      <p>{LIABILITY_LETTER_TEXT.closing}</p>
      <div className="document-signature-block">{personalSignature ? <div className="document-signature-block__personal"><strong>{personalSignature.signerName}</strong><img src={personalSignature.imageUrl} alt={`Persönliche Unterschrift von ${personalSignature.signerName}`} /></div> : <strong>{company.legalName}</strong>}{documentData.attachments?.stamp?.imageUrl && <img className="document-signature-block__stamp" src={documentData.attachments.stamp.imageUrl} alt="Firmenstempel" />}</div>
    </main>
  </DocumentShell>
}
