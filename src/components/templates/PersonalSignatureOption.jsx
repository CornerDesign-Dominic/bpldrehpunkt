import { StaticText } from '../../i18n/AutoTranslate.jsx'
import { Link } from 'react-router-dom'

export default function PersonalSignatureOption({ usePersonalSignature, signatureLoading, signatureNoticeVisible, signatureNoticeMessage, signatureMissing, onToggle }) {
  return <>
    <label className={`document-signature-option${usePersonalSignature ? ' document-signature-option--active' : ''}`}>
      <input type="checkbox" checked={usePersonalSignature} onChange={(event) => { void onToggle(event.target.checked) }} disabled={signatureLoading} />
      <span className="document-signature-option__content">
        <strong><StaticText source={"Persönliche Unterschrift verwenden"} /></strong>
        <small><StaticText source={"Name und hinterlegte Unterschrift werden im Dokument eingefügt."} /></small>
        {signatureLoading && <small><StaticText source={"Unterschrift wird geladen …"} /></small>}
      </span>
    </label>
    {signatureNoticeVisible && <div className="document-signature-notice" role="status">
      <span className="document-signature-notice__icon" aria-hidden="true">!</span>
      <p>{signatureNoticeMessage}</p>
      {signatureMissing && <Link className="button button--secondary" to="/profil"><StaticText source={"Zu Mein Profil"} /></Link>}
    </div>}
  </>
}
