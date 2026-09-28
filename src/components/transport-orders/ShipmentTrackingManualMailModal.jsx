import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from '../icons.jsx'
import { previewManualShipmentTrackingMail } from '../../lib/shipmentTracking.js'

const defaultTemplateId = 'shipment_tracking_license_plate_request'
const senderEmail = 'status@brennpunkt-logistik.de'
const requestTitleByTemplateId = {
  shipment_tracking_arrival_request: 'Statusanfrage – Ankunft',
  shipment_tracking_license_plate_request: 'Statusanfrage – Kennzeichen',
  shipment_tracking_license_plate_and_arrival_request: 'Statusanfrage – Ankunft + Kennzeichen',
  shipment_tracking_general_status_update: 'Statusanfrage – Allgemeines Update',
}

export default function ShipmentTrackingManualMailModal({ orderId, bundles = [], initialTemplateId = '', defaultRecipient = '', saving = false, onClose, onSend }) {
  const [templateId] = useState(() => initialTemplateId || bundles[0]?.templateId || defaultTemplateId)
  const recipient = bundles[0]?.recipient || defaultRecipient
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [previewState, setPreviewState] = useState({ templateId: '', error: '' })
  const requestTitle = requestTitleByTemplateId[templateId] || 'Statusanfrage senden'
  const previewLoading = previewState.templateId !== templateId
  const previewError = previewState.templateId === templateId ? previewState.error : ''
  const matchingBundle = useMemo(() => bundles.find((bundle) => bundle.templateId === templateId && bundle.recipient === recipient) || null, [bundles, recipient, templateId])

  useEffect(() => {
    if (!orderId || !templateId) return undefined
    let current = true
    previewManualShipmentTrackingMail(orderId, templateId).then((result) => {
      if (!current) return
      setSubject(result.subject)
      setMessage(result.message)
      setPreviewState({ templateId, error: '' })
    }).catch((error) => {
      if (current) setPreviewState({ templateId, error: error?.message || 'Die Mailvorlage konnte nicht geladen werden.' })
    })
    return () => { current = false }
  }, [orderId, templateId])

  function submit(event) {
    event.preventDefault()
    if (previewLoading || previewError) return
    onSend({ templateId, recipient, subject, message, ...(matchingBundle ? { bundleId: matchingBundle.id } : {}) })
  }

  return createPortal(<div className="shipment-tracking-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}>
    <section className="shipment-tracking-editor shipment-tracking-manual-mail-modal" role="dialog" aria-modal="true" aria-labelledby="shipment-tracking-manual-mail-title">
      <div className="shipment-tracking-editor__heading"><h2 id="shipment-tracking-manual-mail-title">{requestTitle}</h2><button type="button" onClick={onClose} aria-label="Dialog schließen" disabled={saving}><CloseIcon /></button></div>
      <form onSubmit={submit}>
        <div className="shipment-tracking-editor__groups">
          <section className="shipment-tracking-manual-mail-modal__form"><label className="form-field"><span>Absender</span><input className="shipment-tracking-manual-mail-modal__sender" type="email" disabled value={senderEmail} /></label><label className="form-field"><span>Empfänger</span><input className="shipment-tracking-manual-mail-modal__recipient" type="email" disabled value={recipient} /></label><small className="shipment-tracking-manual-mail-modal__recipient-help" id="shipment-tracking-manual-recipient-help">Empfänger in der Sendungsverfolgung ändern.</small></section>
          <section className="shipment-tracking-manual-mail-modal__form"><label className="form-field"><span>Betreff</span><input required maxLength="240" value={subject} disabled={saving || previewLoading} onChange={(event) => setSubject(event.target.value)} /></label><label className="form-field shipment-tracking-manual-mail-modal__message"><span>Nachricht</span><textarea required rows="10" maxLength="12000" value={message} disabled={saving || previewLoading} onChange={(event) => setMessage(event.target.value)} /></label>{previewLoading && <p>Vorlage wird geladen …</p>}{previewError && <p className="form-error">{previewError}</p>}</section>
        </div>
        <div className="shipment-tracking-editor__actions"><button className="button button--secondary" type="button" disabled={saving} onClick={onClose}>Abbrechen</button><button className="button" type="submit" disabled={saving || previewLoading || Boolean(previewError) || !recipient}>{saving ? 'Wird versendet …' : 'Jetzt senden'}</button></div>
      </form>
    </section>
  </div>, document.body)
}
