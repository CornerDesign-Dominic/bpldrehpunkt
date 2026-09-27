import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from '../icons.jsx'
import { previewManualShipmentTrackingMail } from '../../lib/shipmentTracking.js'

const templates = [
  { id: 'shipment_tracking_license_plate_request', label: 'Kennzeichen anfragen' },
  { id: 'shipment_tracking_arrival_request', label: 'LKW-Ankunft anfragen' },
  { id: 'shipment_tracking_license_plate_and_arrival_request', label: 'Kennzeichen und LKW-Ankunft anfragen' },
]

export default function ShipmentTrackingManualMailModal({ orderId, bundles = [], defaultRecipient = '', saving = false, onClose, onSend }) {
  const [templateId, setTemplateId] = useState(() => bundles[0]?.templateId || templates[0].id)
  const recipient = bundles[0]?.recipient || defaultRecipient
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [previewState, setPreviewState] = useState({ templateId: '', error: '' })
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

  function chooseTemplate(nextTemplateId) {
    setTemplateId(nextTemplateId)
  }

  function submit(event) {
    event.preventDefault()
    if (previewLoading || previewError) return
    onSend({ templateId, recipient, subject, message, ...(matchingBundle ? { bundleId: matchingBundle.id } : {}) })
  }

  return createPortal(<div className="shipment-tracking-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}>
    <section className="shipment-tracking-editor shipment-tracking-manual-mail-modal" role="dialog" aria-modal="true" aria-labelledby="shipment-tracking-manual-mail-title">
      <div className="shipment-tracking-editor__heading"><div><h2 id="shipment-tracking-manual-mail-title">Statusanfrage senden</h2><p>Vorlage und Inhalt können vor dem Versand angepasst werden. Versendet wird ausschließlich an die manuell hinterlegte Unternehmeradresse.</p></div><button type="button" onClick={onClose} aria-label="Dialog schließen" disabled={saving}><CloseIcon /></button></div>
      <form onSubmit={submit}>
        <div className="shipment-tracking-editor__groups">
          <section className="shipment-tracking-manual-mail-modal__form"><label className="form-field"><span>Vorlage</span><select value={templateId} disabled={saving} onChange={(event) => chooseTemplate(event.target.value)}>{templates.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}</select></label><label className="form-field"><span>Empfänger</span><input type="email" readOnly value={recipient} aria-describedby="shipment-tracking-manual-recipient-help" /></label><small id="shipment-tracking-manual-recipient-help">Im Tracking unter „Empfänger Sendungsverfolgung“ ändern.</small></section>
          <section className="shipment-tracking-manual-mail-modal__form"><label className="form-field"><span>Betreff</span><input required maxLength="240" value={subject} disabled={saving || previewLoading} onChange={(event) => setSubject(event.target.value)} /></label><label className="form-field shipment-tracking-manual-mail-modal__message"><span>Nachricht</span><textarea required rows="10" maxLength="12000" value={message} disabled={saving || previewLoading} onChange={(event) => setMessage(event.target.value)} /></label>{previewLoading && <p>Vorlage wird geladen …</p>}{previewError && <p className="form-error">{previewError}</p>}</section>
          <section className="shipment-tracking-manual-mail-modal__summary">{matchingBundle ? <p>Die passende fällige Anfrage enthält <strong>{matchingBundle.topicLabels.join(' und ')}</strong>. Diese Regelstufen werden nach erfolgreichem Versand als versendet dokumentiert.</p> : <p>Dies ist eine freie manuelle Anfrage. Sie wird historisiert, markiert aber keine Regelstufe als erledigt.</p>}</section>
        </div>
        <div className="shipment-tracking-editor__actions"><button className="button button--secondary" type="button" disabled={saving} onClick={onClose}>Abbrechen</button><button className="button" type="submit" disabled={saving || previewLoading || Boolean(previewError) || !recipient}>{saving ? 'Wird versendet …' : 'Jetzt senden'}</button></div>
      </form>
    </section>
  </div>, document.body)
}
