import { useState } from 'react'

const financialFields = [['Streitbetrag', 'amountInDispute']]
const courtTypes = ['Amtsgericht', 'Landgericht', 'Oberlandesgericht', 'Bundesgerichtshof', 'Arbeitsgericht', 'Landesarbeitsgericht', 'Bundesarbeitsgericht', 'Verwaltungsgericht', 'Oberverwaltungsgericht', 'Bundesverwaltungsgericht', 'Sozialgericht', 'Landessozialgericht', 'Bundessozialgericht', 'Finanzgericht', 'Bundesfinanzhof', 'Sonstiges Gericht']

const fieldsBySection = {
  financial: financialFields,
  information: [['Art des Falls', 'caseType'], ['Zuständig', 'responsibleUserName']],
  deadlines: [['Nächste Frist', 'nextDeadline', 'date'], ['Hinweis zur Frist', 'nextDeadlineLabel'], ['Nächster Termin', 'nextHearing', 'date'], ['Uhrzeit', 'nextHearingTime', 'time']],
  parties: [['Verknüpfter Gegner', 'counterparty'], ['Vertretung', 'opposingRepresentation', 'representation'], ['Aktenzeichen der Gegenseite', 'opposingReference']],
  lawyer: [['Kanzlei', 'lawFirm'], ['Ansprechpartner', 'ownCounsel'], ['Aktenzeichen Anwalt', 'lawyerReference'], ['Übergabe an Rechtsanwalt', 'lawyerHandoverDate', 'date'], ['Telefon', 'lawyerPhone'], ['E-Mail', 'lawyerEmail']],
  court: [['Gericht', 'court', 'court'], ['Ort', 'courtLocation'], ['Gerichtliches Aktenzeichen', 'courtReference']],
  procedure: [['Verfahrensart', 'procedureType'], ['Verfahrensstand', 'proceedingStage'], ['Instanz', 'instance'], ['Beginn des Falls', 'startedAt', 'date']],
}

const titles = {
  description: 'Sachverhalt bearbeiten',
  financial: 'Finanziellen Überblick bearbeiten',
  information: 'Fallinformationen bearbeiten',
  deadlines: 'Termine & Fristen bearbeiten',
  parties: 'Beteiligte bearbeiten',
  lawyer: 'Rechtsanwalt / Übergabe bearbeiten',
  court: 'Gericht bearbeiten',
  procedure: 'Verfahren bearbeiten',
}

function initialValue(legalDispute, section) {
  if (section === 'description') return { description: legalDispute.description || '' }
  const fields = fieldsBySection[section] || []
  return Object.fromEntries(fields.map(([, field]) => [field, legalDispute[field] ?? '']).concat(section === 'information' ? [['status', legalDispute.status || 'open']] : []))
}

export default function LegalDisputeEditModal({ legalDispute, section, onCancel, onSubmit }) {
  const [form, setForm] = useState(() => initialValue(legalDispute, section))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fields = fieldsBySection[section] || []

  function update(field, value) { setForm((current) => ({ ...current, [field]: value })) }

  async function save(event) {
    event.preventDefault()
    setSaving(true); setError('')
    try { await onSubmit(form) } catch (saveError) { setError(saveError.message || 'Die Änderung konnte nicht gespeichert werden.') } finally { setSaving(false) }
  }

  return <div className="document-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onCancel() }}><section className="todo-quick-edit-modal legal-dispute-edit-modal" role="dialog" aria-modal="true" aria-labelledby="legal-dispute-edit-title"><form className="todo-quick-editor" onSubmit={save}><div className="todo-quick-editor__heading"><h2 id="legal-dispute-edit-title">{titles[section]}</h2></div>{section === 'description' ? <label className="form-field"><span>Sachverhalt</span><textarea rows="8" value={form.description} onChange={(event) => update('description', event.target.value)} autoFocus /></label> : <div className="legal-dispute-edit-modal__grid">{section === 'information' && <label className="form-field"><span>Status</span><select value={form.status} onChange={(event) => update('status', event.target.value)}><option value="open">Offen</option><option value="completed">Abgeschlossen</option></select></label>}{fields.map(([label, field, type]) => <label className="form-field" key={field}><span>{label}</span>{type === 'representation' ? <select value={form[field]} onChange={(event) => update(field, event.target.value)}><option value="">Auswahl</option><option value="self_represented">Vertritt sich selbst</option><option value="lawyer">Durch Anwalt vertreten</option></select> : type === 'court' ? <select value={form[field]} onChange={(event) => update(field, event.target.value)}><option value="">Auswahl</option>{form[field] && !courtTypes.includes(form[field]) && <option value={form[field]}>{form[field]}</option>}{courtTypes.map((courtType) => <option key={courtType} value={courtType}>{courtType}</option>)}</select> : <input type={section === 'financial' ? 'number' : type || 'text'} min={section === 'financial' ? '0' : undefined} step={section === 'financial' ? '0.01' : undefined} value={form[field]} onChange={(event) => update(field, event.target.value)} />}</label>)}</div>}{error && <p className="form-error">{error}</p>}<div className="form-actions"><button className="button button--secondary" type="button" disabled={saving} onClick={onCancel}>Abbrechen</button><button className="button" type="submit" disabled={saving}>{saving ? 'Wird gespeichert …' : 'Speichern'}</button></div></form></section></div>
}
