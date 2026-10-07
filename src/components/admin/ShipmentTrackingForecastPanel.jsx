import { useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../../lib/firebase.js'
import { DEFAULT_SHIPMENT_TRACKING_FORECAST_SETTINGS, SHIPMENT_TRACKING_FORECAST_SETTINGS_PATH, normalizeShipmentTrackingForecastSettings } from '../../../shared/shipmentTrackingForecastSettings.js'
import { StaticText } from '../../i18n/AutoTranslate.jsx'

const settingsRef = doc(db, ...SHIPMENT_TRACKING_FORECAST_SETTINGS_PATH.split('/'))

const TIMING_PHASES = [
  { id: 'preparation', step: '1', title: 'Vorbereitung', description: 'Wann eine Rückmeldung zur Ankunft an der Ladestelle benötigt wird.', fields: [
    { key: 'noArrivalYellowWorkingHours', label: 'Ohne ETA · gelber Hinweis', unit: 'Arbeitsstd. vor Ladebeginn', tone: 'warning' },
    { key: 'noArrivalRedWorkingHours', label: 'Ohne ETA · rote Frist', unit: 'Arbeitsstd. vor Ladebeginn', tone: 'critical' },
    { key: 'estimatedArrivalYellowWorkingHours', label: 'Mit ETA · gelber Hinweis', unit: 'Arbeitsstd. vor Ladebeginn', tone: 'warning' },
    { key: 'estimatedArrivalRedWorkingHours', label: 'Mit ETA · rote Frist', unit: 'Arbeitsstd. vor Ladebeginn', tone: 'critical' },
  ] },
  { id: 'loading', step: '2', title: 'Ladestelle', description: 'Überwachung von Beginn und Ende der Beladung.', fields: [
    { key: 'loadingStartYellowElapsedHours', label: 'Beladestart · gelber Hinweis', unit: 'Zeitstd. nach Ankunft', tone: 'warning' },
    { key: 'loadingStartRedElapsedHours', label: 'Beladestart · rote Frist', unit: 'Zeitstd. nach Ankunft', tone: 'critical' },
    { key: 'loadingEndYellowElapsedHours', label: 'Beladeende · gelber Hinweis', unit: 'Zeitstd. nach Beladestart', tone: 'warning' },
    { key: 'loadingEndRedElapsedHours', label: 'Beladeende · rote Frist', unit: 'Zeitstd. nach Beladestart', tone: 'critical' },
  ] },
  { id: 'on-the-road', step: '3', title: 'Abfahrt & unterwegs', description: 'Wann die Abfahrt bestätigt oder die Lade-ETA erneut geprüft wird.', fields: [
    { key: 'departureMissingRedElapsedHours', label: 'Abfahrt fehlt · rote Frist', unit: 'Zeitstd. nach Ladeende', tone: 'critical' },
    { key: 'estimatedDepartureRedElapsedHours', label: 'Lade-ETA überschritten · rote Frist', unit: 'Zeitstd. nach Lade-ETA', tone: 'critical' },
  ] },
  { id: 'unloading', step: '4', title: 'Entladestelle', description: 'Frühzeitiger Hinweis vor dem Ende des Entladefensters.', fields: [
    { key: 'unloadingYellowElapsedHoursBeforeDeadline', label: 'Vor Entladeende · gelber Hinweis', unit: 'Zeitstd. vor Slotende', tone: 'warning' },
  ] },
]

export default function ShipmentTrackingForecastPanel() {
  const [settings, setSettings] = useState(DEFAULT_SHIPMENT_TRACKING_FORECAST_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => onSnapshot(settingsRef, (snapshot) => {
    setSettings(normalizeShipmentTrackingForecastSettings(snapshot.exists() ? snapshot.data() : DEFAULT_SHIPMENT_TRACKING_FORECAST_SETTINGS))
    setLoading(false)
    setError('')
  }, () => {
    setError('Prognoseeinstellungen konnten nicht geladen werden.')
    setLoading(false)
  }), [])

  if (loading) return <section className="shipment-tracking-forecast-settings"><h3><StaticText source="Transportprognose" /></h3><p><StaticText source="Einstellungen werden geladen …" /></p></section>
  if (error) return <section className="shipment-tracking-forecast-settings"><h3><StaticText source="Transportprognose" /></h3><p className="form-error">{error}</p></section>
  return <ShipmentTrackingForecastEditor key={JSON.stringify(settings)} settings={settings} />
}

function TimingInput({ field, value, onChange }) {
  const label = field.label.replace(' · gelber Hinweis', '').replace(' · rote Frist', '')
  return <label className="shipment-tracking-forecast-settings__timing-input">
    <span className={`shipment-tracking-forecast-settings__tone shipment-tracking-forecast-settings__tone--${field.tone}`}>{field.tone === 'warning' ? 'Gelb' : 'Rot'}</span>
    <span className="shipment-tracking-forecast-settings__timing-label">{label}</span>
    <span className="shipment-tracking-forecast-settings__timing-control"><input type="number" min="0" max="168" step="0.25" value={value} onChange={(event) => onChange(event.target.value)} /><small>{field.unit}</small></span>
  </label>
}

function ShipmentTrackingForecastEditor({ settings }) {
  const [draft, setDraft] = useState(settings)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')
  const valid = useMemo(() => Number(draft.redThresholdPercent) < Number(draft.greenThresholdPercent), [draft.redThresholdPercent, draft.greenThresholdPercent])
  function updateTiming(key, value) { setDraft((current) => ({ ...current, timing: { ...current.timing, [key]: Number(value) } })) }
  function updateProfile(index, key, value) { setDraft((current) => ({ ...current, vehicleProfiles: current.vehicleProfiles.map((profile, position) => position === index ? { ...profile, [key]: key === 'aliases' ? value.split(',').map((item) => item.trim()).filter(Boolean) : key === 'loadingDurationHours' ? Number(value) : value } : profile) })) }
  async function save() { if (!valid) return; setSaving(true); setFeedback(''); try { await httpsCallable(functions, 'updateShipmentTrackingForecastSettings')({ settings: draft }); setFeedback('Prognoseeinstellungen gespeichert.') } catch { setFeedback('Prognoseeinstellungen konnten nicht gespeichert werden.') } finally { setSaving(false) } }

  return <section className="shipment-tracking-forecast-settings">
    <header className="shipment-tracking-forecast-settings__header">
      <div><h3><StaticText source="Transportprognose" /></h3><p>Die Fristen folgen dem Transportablauf – von der angekündigten Ankunft bis zur Entladestelle. Sie lösen keine E-Mails aus.</p></div>
      <div className="shipment-tracking-forecast-settings__thresholds" aria-label="Pünktlichkeitsgrenzen">
        <label className="shipment-tracking-forecast-settings__threshold shipment-tracking-forecast-settings__threshold--critical"><span>Rot bis</span><input type="number" min="0" max="99" value={draft.redThresholdPercent} onChange={(event) => setDraft((current) => ({ ...current, redThresholdPercent: Number(event.target.value) }))} /><small>%</small></label>
        <label className="shipment-tracking-forecast-settings__threshold shipment-tracking-forecast-settings__threshold--success"><span>Grün ab</span><input type="number" min="1" max="100" value={draft.greenThresholdPercent} onChange={(event) => setDraft((current) => ({ ...current, greenThresholdPercent: Number(event.target.value) }))} /><small>%</small></label>
      </div>
    </header>
    <section className="shipment-tracking-forecast-settings__timing-section" aria-labelledby="forecast-timing-title">
      <div className="shipment-tracking-forecast-settings__section-heading"><div><h4 id="forecast-timing-title">Fristen im Transportablauf</h4><p>Gelb erinnert frühzeitig, Rot kennzeichnet den kritischen Zeitpunkt.</p></div><div className="shipment-tracking-forecast-settings__legend"><span data-tone="warning">Gelb · beobachten</span><span data-tone="critical">Rot · Handlungsbedarf</span></div></div>
      <div className="shipment-tracking-forecast-settings__timeline">
        {TIMING_PHASES.map((phase) => <section className={`shipment-tracking-forecast-settings__phase shipment-tracking-forecast-settings__phase--${phase.id}`} key={phase.id}><header><span>{phase.step}</span><div><h5>{phase.title}</h5><p>{phase.description}</p></div></header><div className="shipment-tracking-forecast-settings__phase-fields">{phase.fields.map((field) => <TimingInput key={field.key} field={field} value={draft.timing[field.key]} onChange={(value) => updateTiming(field.key, value)} />)}</div></section>)}
      </div>
    </section>
    <section className="shipment-tracking-forecast-settings__profiles-section" aria-labelledby="forecast-profiles-title">
      <div className="shipment-tracking-forecast-settings__section-heading"><div><h4 id="forecast-profiles-title">Fahrzeugprofile</h4><p>Die Beladedauer wird für die Transportprognose passend zur Fahrzeugart angesetzt.</p></div></div>
      <div className="shipment-tracking-forecast-settings__profiles">{draft.vehicleProfiles.map((profile, index) => <div key={profile.id}><label className="form-field"><span>Profil</span><input value={profile.label} onChange={(event) => updateProfile(index, 'label', event.target.value)} /></label><label className="form-field"><span>Beladedauer (Std.)</span><input type="number" min="0.25" max="24" step="0.25" value={profile.loadingDurationHours} onChange={(event) => updateProfile(index, 'loadingDurationHours', event.target.value)} /></label><label className="form-field"><span>Importbegriffe, Komma-getrennt</span><input value={profile.aliases.join(', ')} onChange={(event) => updateProfile(index, 'aliases', event.target.value)} /></label></div>)}</div>
    </section>
    {!valid && <p className="form-error">Die rote Grenze muss kleiner als die grüne Grenze sein.</p>}{feedback && <p className={feedback.includes('nicht') ? 'form-error' : 'form-success'}>{feedback}</p>}<div className="shipment-tracking-forecast-settings__actions"><button className="button" type="button" disabled={!valid || saving} onClick={() => void save()}>{saving ? 'Wird gespeichert …' : 'Speichern'}</button></div>
  </section>
}
