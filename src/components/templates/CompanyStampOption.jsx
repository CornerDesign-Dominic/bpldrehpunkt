export default function CompanyStampOption({ stamp }) {
  return <label className={`document-signature-option${stamp.enabled ? ' document-signature-option--active' : ''}`}>
    <input type="checkbox" checked={stamp.enabled} disabled={!stamp.available || stamp.loading} onChange={(event) => { void stamp.toggle(event.target.checked) }} />
    <span className="document-signature-option__content">
      <strong>Firmenstempel verwenden</strong>
      <small>Der von der Administration hinterlegte Stempel wird im Dokument eingefügt.</small>
      {stamp.loading && <small>Stempel wird geladen …</small>}
      {!stamp.loading && !stamp.available && !stamp.error && <small>Noch kein Firmenstempel hinterlegt.</small>}
      {stamp.error && <small role="alert">{stamp.error}</small>}
    </span>
  </label>
}
