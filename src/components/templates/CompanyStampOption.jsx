import { StaticText } from '../../i18n/AutoTranslate.jsx'
export default function CompanyStampOption({ stamp }) {
  return <label className={`document-signature-option${stamp.enabled ? ' document-signature-option--active' : ''}`}>
    <input type="checkbox" checked={stamp.enabled} disabled={!stamp.available || stamp.loading} onChange={(event) => { void stamp.toggle(event.target.checked) }} />
    <span className="document-signature-option__content">
      <strong><StaticText source={"Firmenstempel verwenden"} /></strong>
      <small><StaticText source={"Der von der Administration hinterlegte Stempel wird im Dokument eingefügt."} /></small>
      {stamp.loading && <small><StaticText source={"Stempel wird geladen …"} /></small>}
      {!stamp.loading && !stamp.available && !stamp.error && <small><StaticText source={"Noch kein Firmenstempel hinterlegt."} /></small>}
      {stamp.error && <small role="alert">{stamp.error}</small>}
    </span>
  </label>
}
