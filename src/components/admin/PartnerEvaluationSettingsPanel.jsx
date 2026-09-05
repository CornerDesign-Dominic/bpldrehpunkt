import { useState } from 'react'
import Toast from '../ui/Toast.jsx'
import { normalizePartnerEvaluationSettings, validatePartnerEvaluationSettings } from '../../lib/partnerEvaluation.js'
import { usePartnerEvaluationSettings } from '../../partner-evaluation/usePartnerEvaluationSettings.js'

function RuleRow({ title, fields, error, onChange }) {
  return <div className="partner-evaluation-settings__row"><div><h3>{title}</h3></div><div className="partner-evaluation-settings__inputs">{fields.map(({ key, label, value, suffix, step = '1', min = '0' }) => <label className="form-field" key={key}><span>{label}</span><div className="partner-evaluation-settings__input"><input type="number" min={min} max={title === 'Partner-Ranking' ? '5' : undefined} step={step} value={value} onChange={(event) => onChange(key, event.target.value)} /><span>{suffix}</span></div></label>)}</div>{error && <p className="form-error">{error}</p>}</div>
}

export default function PartnerEvaluationSettingsPanel() {
  const { settings, saveSettings } = usePartnerEvaluationSettings()
  const [draft, setDraft] = useState(() => normalizePartnerEvaluationSettings(settings))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')

  const update = (metric, key, value) => setDraft((current) => ({ ...current, [metric]: { ...current[metric], [key]: value === '' ? '' : Number(value) } }))
  const reset = () => { setDraft(normalizePartnerEvaluationSettings(settings)); setErrors({}); setFeedback('') }

  async function save() {
    const nextErrors = validatePartnerEvaluationSettings(draft)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    setSaving(true)
    setFeedback('')
    try {
      await saveSettings(draft)
      setFeedback('Bewertungsregeln gespeichert.')
    } catch {
      setFeedback('Bewertungsregeln konnten nicht gespeichert werden.')
    } finally { setSaving(false) }
  }

  return <section className="admin-panel partner-evaluation-settings" aria-labelledby="partner-evaluation-settings-title">
    {feedback && <Toast message={feedback} onDismiss={() => setFeedback('')} />}
    <div className="admin-panel__heading"><div><h2 id="partner-evaluation-settings-title">Bewertungsregeln</h2><p>Zentrale Ampelgrenzen für Geschäftspartner. Änderungen gelten sofort in allen Ansichten.</p></div></div>
    <div className="partner-evaluation-settings__legend" aria-label="Farblegende"><span data-status="green">Grün · unauffällig</span><span data-status="yellow">Gelb · Achtung</span><span data-status="red">Rot · kritisch</span><span data-status="neutral">Grau · noch nicht bewertet</span></div>
    <RuleRow title="Palettensaldo" error={errors.pallets} onChange={(key, value) => update('pallets', key, value)} fields={[{ key: 'greenMax', label: 'Grün bis', value: draft.pallets.greenMax, suffix: 'Paletten' }, { key: 'redMin', label: 'Ab Rot', value: draft.pallets.redMin, suffix: 'Paletten' }]} />
    <RuleRow title="Kreditlimit" error={errors.creditLimit} onChange={(key, value) => update('creditLimit', key, value)} fields={[{ key: 'redMax', label: 'Rot bis', value: draft.creditLimit.redMax, suffix: '€', step: '0.01' }, { key: 'yellowMax', label: 'Gelb bis', value: draft.creditLimit.yellowMax, suffix: '€', step: '0.01' }]} />
    <RuleRow title="Partner-Ranking" error={errors.ranking} onChange={(key, value) => update('ranking', key, value)} fields={[{ key: 'redMax', label: 'Rot bis', value: draft.ranking.redMax, suffix: 'von 5', step: '0.1' }, { key: 'greenMin', label: 'Ab Grün', value: draft.ranking.greenMin, suffix: 'von 5', step: '0.1' }]} />
    <div className="partner-evaluation-settings__actions"><button className="button button--secondary" type="button" onClick={reset} disabled={saving}>Abbrechen</button><button className="button" type="button" onClick={save} disabled={saving}>{saving ? 'Wird gespeichert …' : 'Speichern'}</button></div>
  </section>
}
