const addressSections = [
  { title: 'Transportunternehmer', description: 'Empfänger des Schreibens', prefix: 'transport' },
  { title: 'Ladestelle', prefix: 'loading', dateLabel: 'Ladedatum' },
  { title: 'Entladestelle', prefix: 'unloading', dateLabel: 'Entladedatum' },
]

export default function LiabilityLetterForm({ documentData, onChange, headingId = 'liability-form-heading', title = 'Angaben zum Schreiben', description = 'Änderungen erscheinen sofort in der Dokumentvorschau.' }) {
  return <section className="template-form-section" aria-labelledby={headingId}>
    <div className="template-section-heading"><div><h2 id={headingId}>{title}</h2>{description && <p>{description}</p>}</div></div>
    <div className="template-form-grid">
      <label className="form-field template-order-field"><span>Auftragsnummer</span><input value={documentData.orderNumber} onChange={(event) => onChange('orderNumber', event.target.value)} /></label>
      <div className="template-address-grid">
        {addressSections.map(({ title, description, prefix, dateLabel }) => <section className="template-address-section" key={prefix} aria-labelledby={`${prefix}-address-heading`}>
          <div className="template-address-section__heading"><h3 id={`${prefix}-address-heading`}>{title}</h3>{description && <p>{description}</p>}</div>
          <div className="template-address-section__grid">
            <label className="form-field template-address-section__wide"><span>Firma / Name</span><input value={documentData[`${prefix}Company`]} onChange={(event) => onChange(`${prefix}Company`, event.target.value)} /></label>
            <label className="form-field template-address-section__wide"><span>Straße</span><input value={documentData[`${prefix}Street`]} onChange={(event) => onChange(`${prefix}Street`, event.target.value)} /></label>
            <label className="form-field"><span>PLZ</span><input value={documentData[`${prefix}Zip`]} onChange={(event) => onChange(`${prefix}Zip`, event.target.value)} /></label>
            <label className="form-field"><span>Ort</span><input value={documentData[`${prefix}City`]} onChange={(event) => onChange(`${prefix}City`, event.target.value)} /></label>
            <label className="form-field template-address-section__wide"><span>Land</span><input value={documentData[`${prefix}Country`]} onChange={(event) => onChange(`${prefix}Country`, event.target.value)} /></label>
            {dateLabel && <label className="form-field template-address-section__wide"><span>{dateLabel}</span><input type="date" value={documentData[`${prefix}Date`]} onChange={(event) => onChange(`${prefix}Date`, event.target.value)} /></label>}
          </div>
        </section>)}
      </div>
      <label className="form-field template-form__wide"><span>Sachverhalt / individueller Text</span><textarea rows="5" value={documentData.incidentText} onChange={(event) => onChange('incidentText', event.target.value)} placeholder="Beschreiben Sie den Sachverhalt für dieses Schreiben." /></label>
    </div>
  </section>
}
