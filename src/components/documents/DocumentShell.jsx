import letterheadImage from '../../assets/documents/bpl-letterhead.png'
import { useCompanyData } from '../../company/companyDataContext.js'
import { companyFooterColumns, companySenderLine, DEFAULT_COMPANY_DATA } from '../../lib/companyDataModel.js'

export default function DocumentShell({ children, label = 'Dokumentvorschau', paperRef, recipient, recipientMeta }) {
  const { company } = useCompanyData()
  return <article className="document-shell" aria-label={label}>
    <div ref={paperRef} className="document-shell__paper">
      <header className="document-shell__header">{company.legalName === DEFAULT_COMPANY_DATA.legalName ? <img src={letterheadImage} alt={company.legalName} /> : <div className="document-shell__dynamic-header" style={{ fontSize: company.legalName.length > 60 ? '11pt' : '18pt' }}><strong>{company.legalName}</strong></div>}</header>
      <div className="document-shell__content">
        {recipient && <div className="document-shell__recipient"><p className="document-shell__sender-line">{companySenderLine(company)}</p><div className="document-shell__recipient-row"><div className="document-shell__recipient-address">{recipient}</div>{recipientMeta}</div></div>}
        {children}
      </div>
      <footer className="document-shell__footer">
        {companyFooterColumns(company).map((column, columnIndex) => <div key={columnIndex}>{column.map((line) => line.bold ? <strong key={line.text}>{line.text}</strong> : <span key={line.text} className={line.text.startsWith('IBAN:') ? 'document-shell__iban' : ''}>{line.text}</span>)}</div>)}
      </footer>
    </div>
  </article>
}
