import DocumentShell from '../documents/DocumentShell.jsx'
import { formatDocumentDate, getLiabilitySubject } from '../../templates/liabilityDocumentData.js'
import { formatLiabilityAddressLine, LIABILITY_LETTER_TEXT } from '../../templates/liabilityLetterContent.js'
import { documentSignature } from '../../templates/documentSignature.js'

function Value({ children, placeholder = '—' }) {
  return <span className={children ? '' : 'liability-document__empty'}>{children || placeholder}</span>
}

function Address({ company, street, zip, city, country }) {
  const place = [zip, city].filter(Boolean).join(' ')
  return <><Value>{company}</Value><br /><Value>{street}</Value><br /><Value>{place}</Value><br /><Value>{country}</Value></>
}

export default function LiabilityLetterPreview({ documentData, paperRef }) {
  const { orderNumber, transportCompany, transportStreet, transportZip, transportCity, transportCountry, loadingCompany, loadingStreet, loadingZip, loadingCity, loadingCountry, loadingDate, unloadingCompany, unloadingStreet, unloadingZip, unloadingCity, unloadingCountry, unloadingDate, date, incidentText } = documentData
  const loadingAddress = formatLiabilityAddressLine({ company: loadingCompany, street: loadingStreet, zip: loadingZip, city: loadingCity, country: loadingCountry })
  const unloadingAddress = formatLiabilityAddressLine({ company: unloadingCompany, street: unloadingStreet, zip: unloadingZip, city: unloadingCity, country: unloadingCountry })
  const personalSignature = documentSignature(documentData)
  const loadingHeading = [formatDocumentDate(loadingDate), 'Erste Ladestelle:'].filter(Boolean).join(' ')
  const unloadingHeading = [formatDocumentDate(unloadingDate), 'Letzte Entladestelle:'].filter(Boolean).join(' ')
  return <DocumentShell label="Dokumentvorschau Haftbarhaltung" paperRef={paperRef} recipient={<Address company={transportCompany} street={transportStreet} zip={transportZip} city={transportCity} country={transportCountry} />} recipientMeta={<time dateTime={date}>{formatDocumentDate(date)}</time>}>
    <main className="liability-document__content">
      <h2>{getLiabilitySubject(orderNumber)}</h2>
      <p>{LIABILITY_LETTER_TEXT.salutation}</p>
      <p>{LIABILITY_LETTER_TEXT.introduction}</p>
      <div className="liability-document__locations"><p>{loadingHeading}<br /><Value placeholder="">{loadingAddress}</Value></p><p>{unloadingHeading}<br /><Value placeholder="">{unloadingAddress}</Value></p></div>
      <p><Value placeholder="Der individuelle Sachverhalt wird hier eingefügt.">{incidentText}</Value></p>
      <p>{LIABILITY_LETTER_TEXT.reservation}</p>
      <p>{LIABILITY_LETTER_TEXT.insuranceNotice}</p>
      <p>{LIABILITY_LETTER_TEXT.closing}</p>
      <div className="document-signature-block">{personalSignature ? <><strong>{personalSignature.signerName}</strong><img src={personalSignature.imageUrl} alt={`Persönliche Unterschrift von ${personalSignature.signerName}`} /></> : <strong>{LIABILITY_LETTER_TEXT.company}</strong>}</div>
    </main>
  </DocumentShell>
}
