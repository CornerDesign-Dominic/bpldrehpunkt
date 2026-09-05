import letterheadImage from '../../assets/documents/bpl-letterhead.png'
import { BPL_FOOTER_COLUMNS, BPL_SENDER_LINE } from '../../templates/bplDocumentDetails.js'

export default function DocumentShell({ children, label = 'Dokumentvorschau', paperRef, recipient, recipientMeta }) {
  return <article className="document-shell" aria-label={label}>
    <div ref={paperRef} className="document-shell__paper">
      <header className="document-shell__header"><img src={letterheadImage} alt="Brennpunkt Logistik GmbH" /></header>
      <div className="document-shell__content">
        {recipient && <div className="document-shell__recipient"><p className="document-shell__sender-line">{BPL_SENDER_LINE}</p><div className="document-shell__recipient-row"><div className="document-shell__recipient-address">{recipient}</div>{recipientMeta}</div></div>}
        {children}
      </div>
      <footer className="document-shell__footer">
        {BPL_FOOTER_COLUMNS.map((column, columnIndex) => <div key={columnIndex}>{column.map((line) => line.bold ? <strong key={line.text}>{line.text}</strong> : <span key={line.text} className={line.text.startsWith('IBAN:') ? 'document-shell__iban' : ''}>{line.text}</span>)}</div>)}
      </footer>
    </div>
  </article>
}
