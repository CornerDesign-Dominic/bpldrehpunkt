import DocumentShell from '../documents/DocumentShell.jsx'
import { formatDocumentDate, getLiabilitySubject } from '../../templates/liabilityDocumentData.js'

function Value({ children, placeholder = '—' }) {
  return <span className={children ? '' : 'liability-document__empty'}>{children || placeholder}</span>
}

function Address({ company, street, zip, city, country }) {
  const place = [zip, city].filter(Boolean).join(' ')
  return <><Value>{company}</Value><br /><Value>{street}</Value><br /><Value>{place}</Value><br /><Value>{country}</Value></>
}

function formatAddressLine({ company, street, zip, city, country }) {
  const place = [zip, city].filter(Boolean).join(' ').trim()
  return [company, street, place, country].filter((value) => value?.trim()).join(', ')
}

export default function LiabilityLetterPreview({ documentData, paperRef }) {
  const { orderNumber, transportCompany, transportStreet, transportZip, transportCity, transportCountry, loadingCompany, loadingStreet, loadingZip, loadingCity, loadingCountry, loadingDate, unloadingCompany, unloadingStreet, unloadingZip, unloadingCity, unloadingCountry, unloadingDate, date, incidentText } = documentData
  const loadingAddress = formatAddressLine({ company: loadingCompany, street: loadingStreet, zip: loadingZip, city: loadingCity, country: loadingCountry })
  const unloadingAddress = formatAddressLine({ company: unloadingCompany, street: unloadingStreet, zip: unloadingZip, city: unloadingCity, country: unloadingCountry })
  const loadingHeading = [formatDocumentDate(loadingDate), 'Erste Ladestelle:'].filter(Boolean).join(' ')
  const unloadingHeading = [formatDocumentDate(unloadingDate), 'Letzte Entladestelle:'].filter(Boolean).join(' ')
  return <DocumentShell label="Dokumentvorschau Haftbarhaltung" paperRef={paperRef} recipient={<Address company={transportCompany} street={transportStreet} zip={transportZip} city={transportCity} country={transportCountry} />} recipientMeta={<time dateTime={date}>{formatDocumentDate(date)}</time>}>
    <main className="liability-document__content">
      <h2>{getLiabilitySubject(orderNumber)}</h2>
      <p>Sehr geehrte Damen und Herren,</p>
      <p>hiermit halten wir Sie für sämtliche entstandenen Schäden sowie daraus resultierende Kosten und Aufwendungen haftbar, die im Zusammenhang mit dem nachfolgend genannten Transportauftrag entstanden sind oder noch entstehen werden.</p>
      <div className="liability-document__locations"><p>{loadingHeading}<br /><Value placeholder="">{loadingAddress}</Value></p><p>{unloadingHeading}<br /><Value placeholder="">{unloadingAddress}</Value></p></div>
      <p><Value placeholder="Der individuelle Sachverhalt wird hier eingefügt.">{incidentText}</Value></p>
      <p>Wir behalten uns vor, die uns entstandenen sowie noch entstehenden Schäden, Kosten und Aufwendungen geltend zu machen.</p>
      <p>Bitte informieren Sie vorsorglich Ihre Versicherung über den vorliegenden Sachverhalt.</p>
      <p>Mit freundlichen Grüßen</p>
      <p className="liability-document__signature">Brennpunkt Logistik GmbH</p>
    </main>
  </DocumentShell>
}
