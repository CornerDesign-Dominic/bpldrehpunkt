import { formatDocumentDate } from '../../templates/liabilityDocumentData.js'

function Value({ children, placeholder = '—' }) {
  return <span className={children ? '' : 'template-letter__empty'}>{children || placeholder}</span>
}

export default function LiabilityLetterPreview({ documentData }) {
  const { recipientCompany, recipientStreet, recipientZip, recipientCity, orderNumber, loadingPlace, unloadingPlace, date, subject, incidentText } = documentData
  return <article className="template-letter" aria-label="Dokumentvorschau Haftbarhaltung">
    <div className="template-letter__paper">
      <header className="template-letter__header"><div className="template-letter__brand"><strong>Drehpunkt</strong><span>Logistik &amp; Transport</span></div><div className="template-letter__company">Drehpunkt GmbH<br />Musterstraße 12 · 12345 Musterstadt</div></header>
      <div className="template-letter__recipient-date"><address><Value>{recipientCompany}</Value><br /><Value>{recipientStreet}</Value><br /><Value>{[recipientZip, recipientCity].filter(Boolean).join(' ')}</Value></address><time dateTime={date}>{formatDocumentDate(date)}</time></div>
      <main className="template-letter__content">
        <h2><Value placeholder="Haftbarhaltung">{subject}</Value></h2>
        <p>Sehr geehrte Damen und Herren,</p>
        <p>hiermit halten wir Sie für sämtliche Schäden, Kosten und sonstigen Aufwendungen haftbar, die uns im Zusammenhang mit dem nachfolgend genannten Transportauftrag entstanden sind oder noch entstehen werden.</p>
        <dl className="template-letter__facts"><div><dt>Auftragsnummer</dt><dd><Value>{orderNumber}</Value></dd></div><div><dt>Ladestelle</dt><dd><Value>{loadingPlace}</Value></dd></div><div><dt>Entladestelle</dt><dd><Value>{unloadingPlace}</Value></dd></div></dl>
        <p>Dem Schreiben liegt folgender Sachverhalt zugrunde:</p>
        <p className="template-letter__incident"><Value placeholder="Der individuelle Sachverhalt wird hier eingefügt.">{incidentText}</Value></p>
        <p>Wir behalten uns vor, die uns entstandenen und noch entstehenden Kosten geltend zu machen. Bitte nehmen Sie hierzu schriftlich Stellung.</p>
        <p>Mit freundlichen Grüßen</p>
        <p className="template-letter__signature">Drehpunkt GmbH</p>
      </main>
      <footer className="template-letter__footer"><span>Drehpunkt GmbH · Musterstraße 12 · 12345 Musterstadt</span><span>Telefon +49 000 000000 · info@drehpunkt.de</span></footer>
    </div>
  </article>
}
