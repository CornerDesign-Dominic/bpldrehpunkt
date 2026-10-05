import { StaticText } from '../../i18n/AutoTranslate.jsx'
import { useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { useAuth } from '../../auth/useAuth.js'
import { db, functions } from '../../lib/firebase.js'
import { DEFAULT_SHIPMENT_TRACKING_ARRIVAL_CONFIRMATION, normalizeShipmentTrackingArrivalConfirmation, validateShipmentTrackingArrivalConfirmation } from '../../../shared/shipmentTrackingArrivalConfirmation.js'

const settingsRef = doc(db, 'systemSettings', 'shipmentTrackingArrivalConfirmation')

export default function ShipmentTrackingArrivalConfirmationPanel() {
  const { user } = useAuth()
  const [settings, setSettings] = useState(DEFAULT_SHIPMENT_TRACKING_ARRIVAL_CONFIRMATION)
  const [loading, setLoading] = useState(Boolean(user))
  const [readError, setReadError] = useState('')
  useEffect(() => {
    if (!user) return undefined
    return onSnapshot(settingsRef, (snapshot) => { setSettings(normalizeShipmentTrackingArrivalConfirmation(snapshot.exists() ? snapshot.data() : DEFAULT_SHIPMENT_TRACKING_ARRIVAL_CONFIRMATION)); setLoading(false); setReadError('') }, () => { setLoading(false); setReadError('Die ETA-Ladestelle-Anfrage konnte nicht geladen werden.') })
  }, [user])
  return <ShipmentTrackingArrivalConfirmationEditor key={JSON.stringify(settings)} settings={settings} loading={loading} readError={readError} />
}

function ShipmentTrackingArrivalConfirmationEditor({ settings, loading, readError }) {
  const [draft, setDraft] = useState(settings)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')
  const validationError = useMemo(() => { try { validateShipmentTrackingArrivalConfirmation({ ...draft, offsetWorkingHours: Number(draft.offsetWorkingHours) }); return '' } catch (error) { return error.message } }, [draft])
  async function save() {
    if (validationError) return
    setSaving(true); setFeedback('')
    try {
      await httpsCallable(functions, 'updateShipmentTrackingArrivalConfirmation')({ settings: { ...draft, offsetWorkingHours: Number(draft.offsetWorkingHours) } })
      setFeedback('ETA-Ladestelle-Anfrage gespeichert.')
    } catch (error) { setFeedback(error?.code === 'functions/permission-denied' ? 'Keine Berechtigung zum Speichern.' : 'Die Einstellung konnte nicht gespeichert werden. Bitte erneut versuchen.') } finally { setSaving(false) }
  }
  return <section className="admin-panel shipment-tracking-arrival-confirmation" aria-labelledby="shipment-tracking-arrival-confirmation-title"><div className="admin-panel__heading"><div><h2 id="shipment-tracking-arrival-confirmation-title"><StaticText source={"Vor ETA Ladestelle: aktuellen Stand anfragen"} /></h2><p><StaticText source={"Eine eigenständige Mail an den Unternehmer, solange noch keine tatsächliche Ankunft an der Ladestelle erfasst ist."} /></p></div></div>{loading ? <p> <StaticText source={"Einstellungen werden geladen …"} /></p> : readError ? <p className="form-error">{readError}</p> : <><div className="shipment-tracking-arrival-confirmation__controls"><label className="admin-checkbox"><input type="checkbox" checked={draft.enabled} disabled={saving} onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))} /><StaticText source={"Automatik global aktiv"} /></label><label className="form-field"><span><StaticText source={"Arbeitsstunden vor ETA Ladestelle"} /></span><input type="number" min="1" max="48" step="1" value={draft.offsetWorkingHours} disabled={saving} onChange={(event) => setDraft((current) => ({ ...current, offsetWorkingHours: event.target.value }))} /></label></div><p className="shipment-tracking-arrival-confirmation__hint"><StaticText source={"Die Betriebszeiten der Sendungsverfolgung werden berücksichtigt. Je Unternehmer muss die Anfrage ebenfalls aktiviert sein; bei neu angelegten Unternehmern ist sie standardmäßig deaktiviert. Liegt die ETA erst nach dem berechneten Versandzeitpunkt vor, wird die Anfrage als verpasst markiert und nicht automatisch versendet."} /></p><p className="shipment-tracking-arrival-confirmation__hint"><StaticText source={"Betreff und Nachricht dieser Mail bearbeitest du unter Systemmails in der Kategorie Sendungsverfolgung."} /></p>{(validationError || feedback) && <p className={validationError || feedback.includes('nicht') || feedback.includes('Keine') ? 'form-error' : 'shipment-tracking-hours__success'}>{validationError || feedback}</p>}<div className="shipment-tracking-hours__actions"><button className="button" type="button" disabled={saving || Boolean(validationError)} onClick={() => void save()}>{<StaticText source={saving ? 'Wird gespeichert …' : 'Anfrage speichern'} />}</button></div></>}</section>
}
