import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from '../icons.jsx'
import { previewManualShipmentTrackingMail } from '../../lib/shipmentTracking.js'

const templates = [
  { id: 'shipment_tracking_license_plate_request', label: 'Kennzeichen anfragen' },
  { id: 'shipment_tracking_arrival_request', label: 'LKW-Ankunft anfragen' },
  { id: 'shipment_tracking_license_plate_and_arrival_request', label: 'Kennzeichen und LKW-Ankunft anfragen' },
]
const developmentRecipientDomain = '@brennpunkt-logistik.de'

/** Opens a rendered system template in the user's configured mail client.
 * This deliberately has no tracking write or delivery side effect. */
export default function ShipmentTrackingMailtoModal({ orderId, defaultRecipient = '', onClose }) {
  const [templateId, setTemplateId] = useState(templates[0].id)
  const recipient = defaultRecipient
  const [preview, setPreview] = useState({ templateId: '', subject: '', message: '', error: '' })
  const loading = preview.templateId !== templateId
  const error = preview.templateId === templateId ? preview.error : ''
  const recipientAllowed = recipient.trim().toLowerCase().endsWith(developmentRecipientDomain)

  useEffect(() => {
    if (!orderId || !templateId) return undefined
    let current = true
    previewManualShipmentTrackingMail(orderId, templateId).then((result) => {
      if (current) setPreview({ templateId, subject: result.subject, message: result.message, error: '' })
    }).catch((caught) => {
      if (current) setPreview({ templateId, subject: '', message: '', error: caught?.message || 'Die Mailvorlage konnte nicht geladen werden.' })
    })
    return () => { current = false }
  }, [orderId, templateId])

  function openMailClient(event) {
    event.preventDefault()
    if (loading || error || !recipient.trim() || !recipientAllowed) return
    const query = new URLSearchParams({ subject: preview.subject, body: preview.message })
    window.location.assign(`mailto:${encodeURIComponent(recipient.trim())}?${query.toString()}`)
    onClose()
  }

  return createPortal(<div className="shipment-tracking-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="shipment-tracking-editor shipment-tracking-manual-mail-modal" role="dialog" aria-modal="true" aria-labelledby="shipment-tracking-mailto-title">
      <div className="shipment-tracking-editor__heading"><div><h2 id="shipment-tracking-mailto-title">Mail Vorlage öffnen</h2><p>Die Vorlage wird an die manuell hinterlegte Unternehmeradresse im Standard-E-Mail-Programm geöffnet. Es wird nichts versendet oder im Tracking erledigt markiert.</p></div><button type="button" onClick={onClose} aria-label="Dialog schließen"><CloseIcon /></button></div>
      <form onSubmit={openMailClient}>
        <div className="shipment-tracking-editor__groups">
          <section className="shipment-tracking-manual-mail-modal__form"><label className="form-field"><span>Vorlage</span><select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>{templates.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}</select></label><label className="form-field"><span>Empfänger</span><input type="email" readOnly value={recipient} aria-describedby="shipment-tracking-mailto-recipient-help" /></label><small id="shipment-tracking-mailto-recipient-help">Im Tracking unter „Empfänger Sendungsverfolgung“ ändern.</small>{recipient && !recipientAllowed && <p className="form-error">In der Testphase sind nur Empfänger mit @brennpunkt-logistik.de zulässig.</p>}</section>
          <section className="shipment-tracking-manual-mail-modal__preview"><h3>Mailvorschau</h3>{loading ? <p>Vorlage wird geladen …</p> : error ? <p className="form-error">{error}</p> : <><dl><div><dt>Betreff</dt><dd>{preview.subject}</dd></div></dl><p>{preview.message}</p></>}</section>
        </div>
        <div className="shipment-tracking-editor__actions"><button className="button button--secondary" type="button" onClick={onClose}>Abbrechen</button><button className="button" type="submit" disabled={loading || Boolean(error) || !recipient.trim() || !recipientAllowed}>{loading ? 'Vorlage wird geladen …' : 'E-Mail-Programm öffnen'}</button></div>
      </form>
    </section>
  </div>, document.body)
}
