import { Link } from 'react-router-dom'

export default function PersonalSignatureOption({ usePersonalSignature, signatureLoading, signatureNoticeVisible, onToggle }) {
  return <div className="document-signature-settings">
    <label className={`document-signature-option${usePersonalSignature ? ' document-signature-option--active' : ''}`}>
      <input type="checkbox" checked={usePersonalSignature} onChange={(event) => { void onToggle(event.target.checked) }} disabled={signatureLoading} />
      <span className="document-signature-option__content">
        <strong>Persönliche Unterschrift verwenden</strong>
        <small>Name und hinterlegte Unterschrift werden im Dokument eingefügt.</small>
        {signatureLoading && <small>Unterschrift wird geladen …</small>}
      </span>
    </label>
    {signatureNoticeVisible && <div className="document-signature-notice" role="status">
      <span className="document-signature-notice__icon" aria-hidden="true">!</span>
      <p>Du hast noch keine persönliche Unterschrift hinterlegt. Bitte hinterlege deine Unterschrift zuerst unter „Mein Profil“.</p>
      <Link className="button button--secondary" to="/profil">Zu Mein Profil</Link>
    </div>}
  </div>
}
