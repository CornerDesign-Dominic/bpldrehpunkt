import { useState } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from '../icons.jsx'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function initialEmail(tracking, role) { return typeof tracking?.recipients?.[role]?.email === 'string' ? tracking.recipients[role].email : '' }

export default function ShipmentTrackingRecipientsModal({ tracking, saving, onClose, onSave }) {
  const [initialValues] = useState(() => ({ customer: initialEmail(tracking, 'customer'), carrier: initialEmail(tracking, 'carrier') }))
  const [values, setValues] = useState(initialValues)
  const [error, setError] = useState('')
  function update(role, value) { setValues((current) => ({ ...current, [role]: value })) }
  async function submit(event) {
    event.preventDefault()
    const recipientChanges = {}
    for (const role of ['customer', 'carrier']) {
      const email = values[role].trim()
      if (email === initialValues[role]) continue
      if (email && !emailPattern.test(email)) { setError(`Bitte eine gültige E-Mail-Adresse für ${role === 'customer' ? 'Kunde' : 'Unternehmer'} eingeben.`); return }
      recipientChanges[role] = email || null
    }
    if (!Object.keys(recipientChanges).length) { setError('Bitte ändere mindestens eine Empfängeradresse.'); return }
    setError('')
    await onSave({ recipientChanges })
  }
  return createPortal(<div className="shipment-tracking-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}>
    <section className="shipment-tracking-editor shipment-tracking-recipients-modal" role="dialog" aria-modal="true" aria-labelledby="shipment-tracking-recipients-modal-title">
      <div className="shipment-tracking-editor__heading"><div><h2 id="shipment-tracking-recipients-modal-title">Empfänger Sendungsverfolgung</h2></div><button type="button" onClick={onClose} aria-label="Dialog schließen" disabled={saving}><CloseIcon /></button></div>
      <form onSubmit={(event) => void submit(event)} noValidate><div className="shipment-tracking-editor__groups"><section><label className="form-field"><span>Kunde</span><input type="email" value={values.customer} maxLength="320" autoComplete="email" onChange={(event) => update('customer', event.target.value)} /></label><label className="form-field"><span>Unternehmer</span><input type="email" value={values.carrier} maxLength="320" autoComplete="email" onChange={(event) => update('carrier', event.target.value)} /></label></section></div>{error && <p className="form-error">{error}</p>}<div className="shipment-tracking-editor__actions"><button className="button button--secondary" type="button" disabled={saving} onClick={onClose}>Abbrechen</button><button className="button" type="submit" disabled={saving}>{saving ? 'Wird gespeichert …' : 'Speichern'}</button></div></form>
    </section>
  </div>, document.body)
}
