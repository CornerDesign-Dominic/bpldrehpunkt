import DocumentShell from '../documents/DocumentShell.jsx'
import { formatDocumentDate, getLiabilitySubject } from '../../templates/liabilityDocumentData.js'

function Value({ children, placeholder = '—' }) {
  return <span className={children ? '' : 'liability-document__empty'}>{children || placeholder}</span>
}

function Address({ company, street, zip, city, country }) {
  const place = [zip, city].filter(Boolean).join(' ')
  return <><Value>{company}</Value><br /><Value>{street}</Value><br /><Value>{place}</Value><br /><Value>{country}</Value></>
}

export default function LiabilityLetterPreview({ documentData }) {
  const { orderNumber, transportCompany, transportStreet, transportZip, transportCity, transportCountry, loadingCompany, loadingStreet, loadingZip, loadingCity, loadingCountry, loadingDate, unloadingCompany, unloadingStreet, unloadingZip, unloadingCity, unloadingCountry, unloadingDate, date, incidentText } = documentData
  return <DocumentShell label="Dokumentvorschau Haftbarhaltung">
    <div className="liability-document__recipient-date"><address><Address company={transportCompany} street={transportStreet} zip={transportZip} city={transportCity} country={transportCountry} /></address><time dateTime={date}>{formatDocumentDate(date)}</time></div>
    <main className="liability-document__content">
      <h2>{getLiabilitySubject(orderNumber)}</h2>
      <p>Sehr geehrte Damen und Herren,</p>
      <p>hiermit halten wir Sie für sämtliche Schäden, Kosten und sonstigen Aufwendungen haftbar, die uns im Zusammenhang mit dem nachfolgend genannten Transportauftrag entstanden sind oder noch entstehen werden.</p>
      <dl className="liability-document__facts"><div><dt>Ladestelle</dt><dd><Address company={loadingCompany} street={loadingStreet} zip={loadingZip} city={loadingCity} country={loadingCountry} /><span className="liability-document__date">Ladedatum: <Value>{formatDocumentDate(loadingDate)}</Value></span></dd></div><div><dt>Entladestelle</dt><dd><Address company={unloadingCompany} street={unloadingStreet} zip={unloadingZip} city={unloadingCity} country={unloadingCountry} /><span className="liability-document__date">Entladedatum: <Value>{formatDocumentDate(unloadingDate)}</Value></span></dd></div></dl>
      <p>Dem Schreiben liegt folgender Sachverhalt zugrunde:</p>
      <p className="liability-document__incident"><Value placeholder="Der individuelle Sachverhalt wird hier eingefügt.">{incidentText}</Value></p>
      <p>Wir behalten uns vor, die uns entstandenen und noch entstehenden Kosten geltend zu machen. Bitte nehmen Sie hierzu schriftlich Stellung.</p>
      <p>Mit freundlichen Grüßen</p>
      <p className="liability-document__signature">Brennpunkt Logistik GmbH</p>
    </main>
  </DocumentShell>
}
