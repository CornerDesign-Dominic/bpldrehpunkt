const fields = [
  ['recipientCompany', 'Empfänger / Firma', 'text', 'template-form__wide'],
  ['recipientStreet', 'Straße', 'text'],
  ['recipientZip', 'PLZ', 'text'],
  ['recipientCity', 'Ort', 'text'],
  ['orderNumber', 'Auftragsnummer', 'text'],
  ['loadingPlace', 'Ladestelle', 'text'],
  ['unloadingPlace', 'Entladestelle', 'text'],
  ['date', 'Datum', 'date'],
  ['subject', 'Betreff', 'text', 'template-form__wide'],
]

export default function LiabilityLetterForm({ documentData, onChange }) {
  return <section className="template-form-section" aria-labelledby="liability-form-heading">
    <div className="template-section-heading"><div><h2 id="liability-form-heading">Angaben zum Schreiben</h2><p>Änderungen erscheinen sofort in der Dokumentvorschau.</p></div></div>
    <div className="template-form-grid">
      {fields.map(([field, label, type, className = '']) => <label key={field} className={`form-field ${className}`}><span>{label}</span><input type={type} value={documentData[field]} onChange={(event) => onChange(field, event.target.value)} /></label>)}
      <label className="form-field template-form__wide"><span>Sachverhalt / individueller Text</span><textarea rows="5" value={documentData.incidentText} onChange={(event) => onChange('incidentText', event.target.value)} placeholder="Beschreiben Sie den Sachverhalt für dieses Schreiben." /></label>
    </div>
  </section>
}
