import { useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { useAuth } from '../../auth/useAuth.js'
import { db, functions } from '../../lib/firebase.js'

const settingsRef = doc(db, 'systemSettings', 'shipmentTrackingArrivalConfirmation')
const defaults = Object.freeze({
  enabled: true,
  offsetWorkingHours: 2,
  subject: 'Transportauftrag {{transportOrderNumber}} – Bitte aktuellen Stand bestätigen',
  message: 'Guten Tag,\n\nbitte bestätigen Sie kurz, ob für den Transportauftrag {{transportOrderNumber}} alles wie geplant ist oder ob es Änderungen gibt.\n\nLadestelle: {{loadingLocation}}\nGeplanter Beginn: {{loadingTime}}\n\nBitte teilen Sie uns insbesondere die aktuelle voraussichtliche Ankunftszeit mit.\n\nVielen Dank.',
})
const normalize = (value) => ({
  enabled: value?.enabled !== false,
  offsetWorkingHours: Number.isInteger(Number(value?.offsetWorkingHours)) && Number(value.offsetWorkingHours) >= 1 && Number(value.offsetWorkingHours) <= 48 ? Number(value.offsetWorkingHours) : defaults.offsetWorkingHours,
  subject: typeof value?.subject === 'string' && value.subject.trim() ? value.subject.trim() : defaults.subject,
  message: typeof value?.message === 'string' && value.message.trim() ? value.message.trim() : defaults.message,
})
const validPlaceholders = new Set(['transportOrderNumber', 'loadingLocation', 'loadingTime'])
const unknownPlaceholder = (value) => [...String(value || '').matchAll(/{{\s*([^{}\s]+)\s*}}/g)].some((match) => !validPlaceholders.has(match[1]))

export default function ShipmentTrackingArrivalConfirmationPanel() {
  const { user } = useAuth()
  const [settings, setSettings] = useState(defaults)
  const [loading, setLoading] = useState(Boolean(user))
  const [readError, setReadError] = useState('')
  useEffect(() => {
    if (!user) return undefined
    return onSnapshot(settingsRef, (snapshot) => { setSettings(normalize(snapshot.exists() ? snapshot.data() : defaults)); setLoading(false); setReadError('') }, () => { setLoading(false); setReadError('Die Kurz-vor-Ladung-Anfrage konnte nicht geladen werden.') })
  }, [user])
  return <ShipmentTrackingArrivalConfirmationEditor key={JSON.stringify(settings)} settings={settings} loading={loading} readError={readError} />
}

function ShipmentTrackingArrivalConfirmationEditor({ settings, loading, readError }) {
  const [draft, setDraft] = useState(settings)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')
  const validationError = useMemo(() => {
    if (!Number.isInteger(Number(draft.offsetWorkingHours)) || Number(draft.offsetWorkingHours) < 1 || Number(draft.offsetWorkingHours) > 48) return 'Der Zeitpunkt muss zwischen 1 und 48 Arbeitsstunden liegen.'
    if (!String(draft.subject).trim() || !String(draft.message).trim()) return 'Betreff und Nachricht dürfen nicht leer sein.'
    if (unknownPlaceholder(draft.subject) || unknownPlaceholder(draft.message)) return 'Erlaubt sind nur {{transportOrderNumber}}, {{loadingLocation}} und {{loadingTime}}.'
    return ''
  }, [draft])
  async function save() {
    if (validationError) return
    setSaving(true); setFeedback('')
    try {
      await httpsCallable(functions, 'updateShipmentTrackingArrivalConfirmation')({ settings: { ...draft, offsetWorkingHours: Number(draft.offsetWorkingHours) } })
      setFeedback('Kurz-vor-Ladung-Anfrage gespeichert.')
    } catch (error) { setFeedback(error?.code === 'functions/permission-denied' ? 'Keine Berechtigung zum Speichern.' : 'Die Einstellung konnte nicht gespeichert werden. Bitte erneut versuchen.') } finally { setSaving(false) }
  }
  return <section className="admin-panel shipment-tracking-arrival-confirmation" aria-labelledby="shipment-tracking-arrival-confirmation-title"><div className="admin-panel__heading"><div><h2 id="shipment-tracking-arrival-confirmation-title">Kurz vor Ladung: aktuellen Stand anfragen</h2><p>Eine eigenständige Mail an den Unternehmer, solange noch keine tatsächliche Ankunft an der Ladestelle erfasst ist.</p></div></div>{loading ? <p> Einstellungen werden geladen …</p> : readError ? <p className="form-error">{readError}</p> : <><div className="shipment-tracking-arrival-confirmation__controls"><label className="admin-checkbox"><input type="checkbox" checked={draft.enabled} disabled={saving} onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))} />Automatik global aktiv</label><label className="form-field"><span>Arbeitsstunden vor frühester Beladung</span><input type="number" min="1" max="48" step="1" value={draft.offsetWorkingHours} disabled={saving} onChange={(event) => setDraft((current) => ({ ...current, offsetWorkingHours: event.target.value }))} /></label></div><p className="shipment-tracking-arrival-confirmation__hint">Die Betriebszeiten der Sendungsverfolgung werden berücksichtigt. Je Unternehmer muss die Anfrage ebenfalls aktiviert sein; bei neu angelegten Unternehmern ist sie standardmäßig aktiv.</p><label className="form-field"><span>Betreff</span><input maxLength="240" value={draft.subject} disabled={saving} onChange={(event) => setDraft((current) => ({ ...current, subject: event.target.value }))} /></label><label className="form-field shipment-tracking-arrival-confirmation__message"><span>Nachricht</span><textarea rows="8" maxLength="12000" value={draft.message} disabled={saving} onChange={(event) => setDraft((current) => ({ ...current, message: event.target.value }))} /></label><p className="shipment-tracking-arrival-confirmation__variables">Verfügbare Platzhalter: <code>{'{{transportOrderNumber}}'}</code>, <code>{'{{loadingLocation}}'}</code>, <code>{'{{loadingTime}}'}</code></p>{(validationError || feedback) && <p className={validationError || feedback.includes('nicht') || feedback.includes('Keine') ? 'form-error' : 'shipment-tracking-hours__success'}>{validationError || feedback}</p>}<div className="shipment-tracking-hours__actions"><button className="button" type="button" disabled={saving || Boolean(validationError)} onClick={() => void save()}>{saving ? 'Wird gespeichert …' : 'Anfrage speichern'}</button></div></>}</section>
}
