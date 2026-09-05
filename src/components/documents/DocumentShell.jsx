import letterheadImage from '../../assets/documents/bpl-letterhead.png'

export default function DocumentShell({ children, label = 'Dokumentvorschau', recipient, recipientMeta }) {
  return <article className="document-shell" aria-label={label}>
    <div className="document-shell__paper">
      <header className="document-shell__header"><img src={letterheadImage} alt="Brennpunkt Logistik GmbH" /></header>
      <div className="document-shell__content">
        {recipient && <div className="document-shell__recipient"><p className="document-shell__sender-line">Brennpunkt Logistik GmbH · Reinshagenstr. 1 · D-42369 Wuppertal</p><div className="document-shell__recipient-row"><div className="document-shell__recipient-address">{recipient}</div>{recipientMeta}</div></div>}
        {children}
      </div>
      <footer className="document-shell__footer">
        <div><strong>Brennpunkt Logistik GmbH</strong><span>Reinshagenstr. 1</span><span>D-42369 Wuppertal</span></div>
        <div><span><strong>Geschäftsführer:</strong> Dieter Elas</span><span><strong>Handelsregister:</strong> HRB 27075 Wuppertal</span><span><strong>USt-ID-Nr.:</strong> DE304818005</span></div>
        <div><span><strong>Tel:</strong> +49 202 26155-771</span><span><strong>E-Mail:</strong> info@brennpunkt-logistik.de</span><span><strong>Web:</strong> www.brennpunkt-logistik.de</span></div>
        <div><strong>Stadtsparkasse</strong><span className="document-shell__iban">IBAN: DE16 3405 0000 0000 1318 47</span><span>SWIFT: WELADED1XXX</span></div>
      </footer>
    </div>
  </article>
}
