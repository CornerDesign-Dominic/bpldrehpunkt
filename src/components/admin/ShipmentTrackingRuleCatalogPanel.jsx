import { useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { TrashIcon } from '../icons.jsx'
import { db, functions } from '../../lib/firebase.js'
import { fallbackShipmentTrackingRuleCatalog, validateShipmentTrackingRuleCatalog } from '../../../shared/shipmentTrackingRuleCatalog.js'

const catalogRef = doc(db, 'systemSettings', 'shipmentTrackingRuleCatalog')
const topics = [{ key: 'licensePlate', label: 'Kennzeichen' }, { key: 'loadingSite', label: 'Ladestelle' }]
const localKey = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
const wholeNumber = (value) => value === '' ? 0 : Number(value)
const offsetParts = (value) => {
  const totalMinutes = Math.max(0, Math.round(Number(value || 0) * 60))
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 }
}
const publicCatalog = (catalog) => ({ version: catalog.version, topics: Object.fromEntries(topics.map(({ key }) => [key, { initialRequest: { id: catalog.topics[key].initialRequest.id, offsetWorkingHours: catalog.topics[key].initialRequest.offsetWorkingHours }, reminders: catalog.topics[key].reminders.map(({ id, offsetWorkingHours }) => id ? { id, offsetWorkingHours } : { offsetWorkingHours }), internalEscalations: catalog.topics[key].internalEscalations.map(({ id, offsetWorkingHours }) => id ? { id, offsetWorkingHours } : { offsetWorkingHours }), ...(catalog.topics[key].customerRequirement ? { customerRequirement: { id: catalog.topics[key].customerRequirement.id, offsetWorkingHours: catalog.topics[key].customerRequirement.offsetWorkingHours } } : {}) }])), retiredRuleIds: catalog.retiredRuleIds || [] })
const editorCatalog = (catalog) => {
  const defaults = fallbackShipmentTrackingRuleCatalog()
  return { ...catalog, topics: Object.fromEntries(topics.map(({ key }) => [key, { ...catalog.topics[key], customerRequirement: catalog.topics[key].customerRequirement || defaults.topics[key].customerRequirement }])) }
}
const missingCustomerRequirementTopics = (catalog) => topics.filter(({ key }) => !catalog?.topics?.[key]?.customerRequirement).map(({ label }) => label)
const validationCatalog = (catalog) => {
  const publicValue = publicCatalog(catalog)
  return {
    ...publicValue,
    topics: Object.fromEntries(topics.map(({ key }) => [key, {
      ...publicValue.topics[key],
      reminders: catalog.topics[key].reminders.map((rule) => ({ id: rule.id || `temporary.${rule.clientKey}`, offsetWorkingHours: rule.offsetWorkingHours })),
      internalEscalations: catalog.topics[key].internalEscalations.map((rule) => ({ id: rule.id || `temporary.${rule.clientKey}`, offsetWorkingHours: rule.offsetWorkingHours })),
      customerRequirement: catalog.topics[key].customerRequirement,
    }])),
  }
}

function OffsetInput({ value, label, onChange }) {
  const { hours, minutes } = offsetParts(value)
  const update = (nextHours, nextMinutes) => onChange(Math.max(0, nextHours) + Math.max(0, nextMinutes) / 60)
  return <label className="shipment-tracking-rule-catalog__offset"><input type="number" min="0" step="1" value={hours} aria-label={`${label}: Stunden`} onChange={(event) => { const next = wholeNumber(event.target.value); if (Number.isInteger(next) && next >= 0) update(next, minutes) }} /><span>Std.</span><input type="number" min="0" max="59" step="1" value={minutes} aria-label={`${label}: Minuten`} onChange={(event) => { const next = wholeNumber(event.target.value); if (Number.isInteger(next) && next >= 0 && next < 60) update(hours, next) }} /><span>Min. vorher</span></label>
}

function RuleRow({ step, label, rule, onChange, onRemove }) {
  return <div className="shipment-tracking-rule-catalog__row">
    <span className="shipment-tracking-rule-catalog__step" aria-hidden="true">{step}</span>
    <span className="shipment-tracking-rule-catalog__label">{label}</span>
    <OffsetInput label={`${label}, Stufe ${step}`} value={rule.offsetWorkingHours} onChange={onChange} />
    {onRemove && <button className="shipment-tracking-rule-catalog__remove" type="button" onClick={onRemove} title={`${label} entfernen`} aria-label={`${label} entfernen`}><TrashIcon size={15} /></button>}
  </div>
}

function TopicEditor({ topic, value, onChange }) {
  const update = (group, index, offsetWorkingHours) => onChange({ ...value, [group]: value[group].map((rule, current) => current === index ? { ...rule, offsetWorkingHours } : rule) })
  const add = (group, offsetWorkingHours) => onChange({ ...value, [group]: [...value[group], { clientKey: localKey(), offsetWorkingHours }] })
  const remove = (group, index) => onChange({ ...value, [group]: value[group].filter((_, current) => current !== index) })
  const reminderSuggestion = Math.max(1, (value.reminders.at(-1) || value.initialRequest).offsetWorkingHours - 1)
  const escalationSuggestion = Math.max(0, value.internalEscalations.at(-1).offsetWorkingHours - 1)
  const internalStart = value.reminders.length + 2

  return <section className="shipment-tracking-rule-catalog__topic" aria-labelledby={`shipment-tracking-rule-catalog-${topic.key}`}>
    <h3 id={`shipment-tracking-rule-catalog-${topic.key}`}>{topic.label}</h3>
    <div className="shipment-tracking-rule-catalog__group">
      <h4>Extern</h4>
      <RuleRow step={1} label="Erste Anfrage" rule={value.initialRequest} onChange={(offsetWorkingHours) => onChange({ ...value, initialRequest: { ...value.initialRequest, offsetWorkingHours } })} />
      {value.reminders.map((rule, index) => <RuleRow key={rule.id || rule.clientKey} step={index + 2} label="Erinnerung" rule={rule} onChange={(offsetWorkingHours) => update('reminders', index, offsetWorkingHours)} onRemove={() => remove('reminders', index)} />)}
      <button className="button button--secondary shipment-tracking-rule-catalog__add" type="button" disabled={value.reminders.length >= 5} onClick={() => add('reminders', reminderSuggestion)}>+ Erinnerung</button>
    </div>
    <div className="shipment-tracking-rule-catalog__group shipment-tracking-rule-catalog__group--internal">
      <h4>Intern</h4>
      {value.internalEscalations.map((rule, index) => <RuleRow key={rule.id || rule.clientKey} step={internalStart + index} label="BPL intern informieren" rule={rule} onChange={(offsetWorkingHours) => update('internalEscalations', index, offsetWorkingHours)} onRemove={value.internalEscalations.length > 1 ? () => remove('internalEscalations', index) : null} />)}
      <button className="button button--secondary shipment-tracking-rule-catalog__add" type="button" disabled={value.internalEscalations.length >= 5} onClick={() => add('internalEscalations', escalationSuggestion)}>+ Eskalation</button>
    </div>
    <div className="shipment-tracking-rule-catalog__group shipment-tracking-rule-catalog__group--customer-requirement">
      <h4>Kundenanforderung</h4>
      <RuleRow step="K" label="Kunde wichtig: BPL intern informieren" rule={value.customerRequirement} onChange={(offsetWorkingHours) => onChange({ ...value, customerRequirement: { ...value.customerRequirement, offsetWorkingHours } })} />
    </div>
  </section>
}

function RuleCatalogEditor({ catalog, catalogExists, loading, error }) {
  const [draft, setDraft] = useState(() => editorCatalog(catalog))
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')
  const validationError = useMemo(() => { try { validateShipmentTrackingRuleCatalog(validationCatalog(draft)); return '' } catch (validation) { return validation.message } }, [draft])
  const hasChanges = useMemo(() => JSON.stringify(publicCatalog(draft)) !== JSON.stringify(publicCatalog(catalog)), [catalog, draft])
  const missingRequirements = useMemo(() => missingCustomerRequirementTopics(catalog), [catalog])
  const canSave = catalogExists ? hasChanges : true
  const updateTopic = (key, value) => { setFeedback(''); setDraft((current) => ({ ...current, topics: { ...current.topics, [key]: value } })) }
  async function save() {
    if (validationError || !canSave) return
    setSaving(true); setFeedback('')
    try { await httpsCallable(functions, 'updateShipmentTrackingRuleCatalog')({ catalog: publicCatalog(draft) }); setFeedback('Regelstufen gespeichert.') } catch (requestError) { setFeedback(requestError?.code === 'functions/permission-denied' ? 'Die Regelstufen konnten nicht gespeichert werden: Keine Berechtigung.' : 'Die Regelstufen konnten nicht gespeichert werden. Bitte erneut versuchen.') } finally { setSaving(false) }
  }
  return <section className="admin-panel shipment-tracking-rule-catalog" aria-labelledby="shipment-tracking-rule-catalog-title">
    <div className="admin-panel__heading"><div><h2 id="shipment-tracking-rule-catalog-title">Sendungsverfolgung – Regelstufen</h2></div></div>
    {loading ? <p>Regelstufen werden geladen …</p> : error ? <p className="form-error">{error}</p> : <>
      <p className="shipment-tracking-rule-catalog__hint">Zeiten in Arbeitsstunden vor der frühesten Beladung</p>
      {!catalogExists && <p className="shipment-tracking-rule-catalog__setup">Der Regelkatalog ist noch nicht angelegt. Prüfe bei Bedarf die Startwerte und lege ihn anschließend einmalig an.</p>}
      {missingRequirements.length > 0 && <p className="shipment-tracking-rule-catalog__migration-note"><strong>Aktualisierung erforderlich:</strong> Für {missingRequirements.join(' und ')} ist die Kundenanforderungs-Stufe unten bereits vorgeschlagen, aber noch nicht Teil des gespeicherten Regelwerks. Mit dem hervorgehobenen Button übernehmen.</p>}
      <div className="shipment-tracking-rule-catalog__topics">{topics.map((topic) => <TopicEditor key={topic.key} topic={topic} value={draft.topics[topic.key]} onChange={(value) => updateTopic(topic.key, value)} />)}</div>
      {(validationError || feedback) && <p className={validationError || feedback.includes('konnten') ? 'form-error' : 'shipment-tracking-rule-catalog__success'}>{validationError || feedback}</p>}
      <div className="shipment-tracking-rule-catalog__actions"><button className={canSave ? 'button shipment-tracking-rule-catalog__save--changed' : 'button'} type="button" disabled={saving || Boolean(validationError) || !canSave} onClick={() => void save()}>{saving ? 'Wird gespeichert …' : catalogExists ? missingRequirements.length ? 'Regelwerk aktualisieren & speichern' : 'Regelstufen speichern' : 'Regelkatalog anlegen'}</button></div>
    </>}
  </section>
}

export default function ShipmentTrackingRuleCatalogPanel() {
  const [catalog, setCatalog] = useState(fallbackShipmentTrackingRuleCatalog)
  const [catalogExists, setCatalogExists] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => onSnapshot(catalogRef, (snapshot) => { setCatalogExists(snapshot.exists()); setCatalog(snapshot.exists() ? snapshot.data() : fallbackShipmentTrackingRuleCatalog()); setLoading(false); setError('') }, () => { setLoading(false); setError('Die Regelstufen konnten nicht geladen werden.') }), [])
  return <RuleCatalogEditor key={`${catalogExists}:${JSON.stringify(catalog)}`} catalog={catalog} catalogExists={catalogExists} loading={loading} error={error} />
}
