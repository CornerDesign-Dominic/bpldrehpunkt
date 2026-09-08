const addressFields = [
  ['recipientCompany', 'Firma / Name', 'wide'],
  ['recipientStreet', 'Straße', 'wide'],
  ['recipientZip', 'PLZ'],
  ['recipientCity', 'Ort'],
  ['recipientCountry', 'Land', 'wide'],
]

export default function BusinessDocumentForm({ documentData, onChange }) {
  return <section className="template-form-section" aria-labelledby="business-document-form-heading">
    <div className="template-section-heading"><div><h2 id="business-document-form-heading">Angaben zum Schreiben</h2><p>Änderungen erscheinen sofort in der Dokumentvorschau.</p></div></div>
    <div className="template-form-grid">
      <section className="template-address-section business-document-form__recipient" aria-labelledby="business-document-recipient-heading">
        <div className="template-address-section__heading"><h3 id="business-document-recipient-heading">Empfänger</h3></div>
        <div className="template-address-section__grid">{addressFields.map(([field, label, width]) => <label className={`form-field${width === 'wide' ? ' template-address-section__wide' : ''}`} key={field}><span>{label}</span><input value={documentData[field]} onChange={(event) => onChange(field, event.target.value)} /></label>)}</div>
      </section>
      <label className="form-field template-form__wide"><span>Betreff</span><input value={documentData.subject} onChange={(event) => onChange('subject', event.target.value)} /></label>
      <label className="form-field template-form__wide"><span>Inhalt</span><textarea rows="12" value={documentData.content} onChange={(event) => onChange('content', event.target.value)} placeholder="Schreiben Sie den Inhalt Ihres Geschäftsdokuments." /></label>
    </div>
  </section>
}
