import { useState } from 'react'
import { useCompanyHolidaySettings } from '../../company-holidays/useCompanyHolidaySettings.js'
import { GERMAN_STATES } from '../../lib/holidayCalendar.js'

function CompanyHolidaySettingsEditor({ region, saveRegion }) {
  const [draft, setDraft] = useState(region)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')

  async function save() {
    setSaving(true)
    setFeedback('')
    try {
      await saveRegion(draft)
      setFeedback('Standardfeiertage gespeichert.')
    } catch {
      setFeedback('Standardfeiertage konnten nicht gespeichert werden.')
    } finally {
      setSaving(false)
    }
  }

  return <section className="admin-panel company-holiday-settings" aria-labelledby="company-holiday-settings-title">
    <div className="admin-panel__heading"><div><h2 id="company-holiday-settings-title">Standardfeiertage</h2><p>Diese Region bestimmt die Feiertage in allen Arbeitskalendern.</p></div></div>
    <div className="company-holiday-settings__fields">
      <label className="form-field"><span>Land</span><select value={draft.countryCode} disabled><option value="DE">Deutschland</option></select></label>
      <label className="form-field"><span>Bundesland</span><select value={draft.subdivisionCode} onChange={(event) => setDraft((current) => ({ ...current, subdivisionCode: event.target.value }))}>{GERMAN_STATES.map((state) => <option key={state.code} value={`DE-${state.code}`}>{state.name}</option>)}</select></label>
    </div>
    {feedback && <p className={feedback.includes('konnten') ? 'form-error' : 'company-holiday-settings__success'}>{feedback}</p>}
    <div className="company-holiday-settings__actions"><button className="button" type="button" disabled={saving} onClick={save}>{saving ? 'Wird gespeichert …' : 'Speichern'}</button></div>
  </section>
}

export default function CompanyHolidaySettingsPanel() {
  const { region, saveRegion } = useCompanyHolidaySettings()
  return <CompanyHolidaySettingsEditor key={`${region.countryCode}-${region.subdivisionCode}`} region={region} saveRegion={saveRegion} />
}
