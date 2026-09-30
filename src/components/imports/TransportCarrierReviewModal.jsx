import { useState } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from '../icons.jsx'

const shown = (value) => value || '—'

function candidateAddress(candidate) {
  const address = candidate?.address || {}
  return [
    [address.street, address.houseNumber].filter(Boolean).join(' '),
    [address.postalCode, address.city].filter(Boolean).join(' '),
    address.country,
  ].filter(Boolean).join(', ') || '—'
}

function ComparisonValues({ name, email, orderContact, candidate }) {
  return <dl className="transport-carrier-review__values">
    <div><dt>Firmenname</dt><dd>{shown(name)}</dd></div>
    <div><dt>Standard-E-Mail</dt><dd>{shown(email)}</dd></div>
    {candidate && <><div><dt>Debitorennummern</dt><dd>{candidate.debtorNumbers?.join(', ') || '—'}</dd></div><div><dt>Kreditorennummern</dt><dd>{candidate.creditorNumbers?.join(', ') || '—'}</dd></div><div><dt>Adresse</dt><dd>{candidateAddress(candidate)}</dd></div><div><dt>Telefon</dt><dd>{shown(candidate.contact?.phone)}</dd></div><div><dt>Website</dt><dd>{shown(candidate.contact?.website)}</dd></div></>}
    {orderContact && !candidate && <div><dt>Kontakt für diesen Auftrag</dt><dd>{orderContact}</dd></div>}
  </dl>
}

export default function TransportCarrierReviewModal({ row, currentResolution, onClose, onConfirm }) {
  const [selected, setSelected] = useState(currentResolution || '')
  const candidates = row.carrier?.candidates || []
  const candidate = candidates.find((item) => item.id === selected)
  const isNew = selected === 'new'
  const imported = row.imported

  return createPortal(<div className="customer-import-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }} onKeyDown={(event) => { if (event.key === 'Escape') onClose() }}><section className="customer-import-modal transport-carrier-review" role="dialog" aria-modal="true" aria-labelledby="transport-carrier-review-title"><div className="customer-import-modal__heading"><div><h2 id="transport-carrier-review-title">Unternehmer für TA {row.externalNumber} prüfen</h2><p>Vergleiche die Angaben aus dem Auftrag mit einem möglichen Stammdatenblatt und entscheide bewusst über die Zuordnung.</p></div><button type="button" onClick={onClose} aria-label="Dialog schließen"><CloseIcon /></button></div>
    <div className="transport-carrier-review__columns"><section className="transport-carrier-review__panel"><h3>Aus dem Auftrag importiert</h3><ComparisonValues name={imported.carrier.originalName} email={imported.contacts?.carrierStandardEmail} orderContact={imported.contacts?.carrierForOrder} /><p className="transport-carrier-review__note">Der TA-Export enthält für diesen Unternehmer keine Kreditorennummer.</p></section>
      <section className="transport-carrier-review__panel"><label className="transport-carrier-review__select"><span>Mögliches Stammdatenblatt auswählen</span><select autoFocus value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">Bitte auswählen …</option>{candidates.map((item) => <option key={item.id} value={item.id}>{item.companyName} ({item.score} % Übereinstimmung)</option>)}<option value="new">Neu – Unternehmer anlegen</option></select></label>{candidate ? <><p className="transport-carrier-review__match">Namensähnlichkeit: {candidate.score} % · bitte Stammdaten selbst vergleichen</p><ComparisonValues candidate={candidate} name={candidate.companyName} email={candidate.contact?.email} /></> : isNew ? <><h3>Neuer Unternehmer</h3><ComparisonValues name={imported.carrier.originalName} email={imported.contacts?.carrierStandardEmail} /><p className="transport-carrier-review__note">Ein neues Stammdatenblatt ohne Kreditorennummer wird beim bestätigten Import angelegt und mit diesem Auftrag verknüpft.</p></> : <p className="transport-carrier-review__placeholder">Wähle oben einen möglichen Treffer oder „Neu“, um die Angaben hier zu sehen.</p>}</section></div>
    <p className="transport-carrier-review__note">Diese Auswahl wird erst mit „Änderungen übernehmen“ in der Importvorschau gespeichert.</p>
    <div className="customer-import-modal__actions"><button className="button button--secondary" type="button" onClick={onClose}>Abbrechen</button><button className="button" type="button" disabled={!selected} onClick={() => onConfirm(selected)}>{isNew ? 'Neuen Unternehmer anlegen' : 'Ausgewählten übernehmen'}</button></div>
  </section></div>, document.body)
}
