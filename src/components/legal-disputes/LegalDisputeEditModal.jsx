import { useState } from 'react'

const financialFields = [
  ['Ursprüngliche Forderung', 'originalClaim'], ['Gegenforderung', 'counterClaim'], ['Streitwert', 'amountInDispute'], ['Bereits gezahlt', 'paidAmount'],
  ['Noch offen', 'openAmount'], ['Rechtsanwaltskosten', 'legalFees'], ['Gerichtskosten', 'courtCosts'], ['Sonstige Kosten', 'otherCosts'],
]

const informationFields = [
  ['Art des Falls', 'caseType'], ['Zuständig', 'responsibleUserName'], ['Beteiligter', 'participant'], ['Gegner', 'counterparty'], ['Gegnerischer Rechtsanwalt', 'opposingCounsel'],
  ['Kanzlei', 'lawFirm'], ['Ansprechpartner', 'ownCounsel'], ['Aktenzeichen Anwalt', 'lawyerReference'], ['Telefon', 'lawyerPhone'], ['E-Mail', 'lawyerEmail'],
  ['Gericht', 'court'], ['Gerichtliches Aktenzeichen', 'courtReference'], ['Richter / Kammer', 'judgeOrChamber'], ['Nächste Frist', 'nextDeadline', 'date'], ['Hinweis zur Frist', 'nextDeadlineLabel'],
  ['Nächster Termin', 'nextHearing', 'date'], ['Uhrzeit', 'nextHearingTime', 'time'], ['Verfahrensart', 'procedureType'], ['Verfahrensstand', 'proceedingStage'], ['Instanz', 'instance'], ['Beginn des Falls', 'startedAt', 'date'],
]

const titles = { description: 'Sachverhalt bearbeiten', financial: 'Finanziellen Überblick bearbeiten', information: 'Fallinformationen bearbeiten' }

function initialValue(legalDispute, section) {
  if (section === 'description') return { description: legalDispute.description || '' }
  const fields = section === 'financial' ? financialFields : informationFields
  return Object.fromEntries(fields.map(([, field]) => [field, legalDispute[field] ?? '']).concat(section === 'information' ? [['status', legalDispute.status || 'open']] : []))
}

export default function LegalDisputeEditModal({ legalDispute, section, onCancel, onSubmit }) {
  const [form, setForm] = useState(() => initialValue(legalDispute, section))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fields = section === 'financial' ? financialFields : informationFields

  function update(field, value) { setForm((current) => ({ ...current, [field]: value })) }

  async function save(event) {
    event.preventDefault()
    setSaving(true); setError('')
    try { await onSubmit(form) } catch (saveError) { setError(saveError.message || 'Die Änderung konnte nicht gespeichert werden.') } finally { setSaving(false) }
  }

  return <div className="document-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onCancel() }}><section className="todo-quick-edit-modal legal-dispute-edit-modal" role="dialog" aria-modal="true" aria-labelledby="legal-dispute-edit-title"><form className="todo-quick-editor" onSubmit={save}><div className="todo-quick-editor__heading"><h2 id="legal-dispute-edit-title">{titles[section]}</h2></div>{section === 'description' ? <label className="form-field"><span>Sachverhalt</span><textarea rows="8" value={form.description} onChange={(event) => update('description', event.target.value)} autoFocus /></label> : <div className="legal-dispute-edit-modal__grid">{section === 'information' && <label className="form-field"><span>Status</span><select value={form.status} onChange={(event) => update('status', event.target.value)}><option value="open">Offen</option><option value="completed">Abgeschlossen</option></select></label>}{fields.map(([label, field, type]) => <label className="form-field" key={field}><span>{label}</span><input type={section === 'financial' ? 'number' : type || 'text'} min={section === 'financial' ? '0' : undefined} step={section === 'financial' ? '0.01' : undefined} value={form[field]} onChange={(event) => update(field, event.target.value)} /></label>)}</div>}{error && <p className="form-error">{error}</p>}<div className="form-actions"><button className="button button--secondary" type="button" disabled={saving} onClick={onCancel}>Abbrechen</button><button className="button" type="submit" disabled={saving}>{saving ? 'Wird gespeichert …' : 'Speichern'}</button></div></form></section></div>
}
