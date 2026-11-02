import { StaticText } from '../../i18n/AutoTranslate.jsx'
import { useEffect, useState } from 'react'

import { usePermissions } from '../../auth/usePermissions.js'
import { listBusinessPartners } from '../../lib/businessPartners.js'
import { reportTechnicalFailure } from '../../lib/diagnostics.js'
import LegalDisputeCounterpartyField from './LegalDisputeCounterpartyField.jsx'

const financialFields = [['Streitbetrag', 'amountInDispute']]
const courtTypes = ['Amtsgericht', 'Landgericht', 'Oberlandesgericht', 'Bundesgerichtshof', 'Arbeitsgericht', 'Landesarbeitsgericht', 'Bundesarbeitsgericht', 'Verwaltungsgericht', 'Oberverwaltungsgericht', 'Bundesverwaltungsgericht', 'Sozialgericht', 'Landessozialgericht', 'Bundessozialgericht', 'Finanzgericht', 'Bundesfinanzhof', 'Sonstiges Gericht']

const fieldsBySection = {
  financial: financialFields,
  information: [['Art des Falls', 'caseType'], ['Transportauftragsnummer', 'transportReference']],
  parties: [['Vertretung', 'opposingRepresentation', 'representation'], ['Aktenzeichen der Gegenseite', 'opposingReference']],
  lawyer: [['Kanzlei', 'lawFirm'], ['Ansprechpartner', 'ownCounsel'], ['Aktenzeichen Anwalt', 'lawyerReference'], ['Übergabe an Rechtsanwalt', 'lawyerHandoverDate', 'date'], ['Telefon', 'lawyerPhone'], ['E-Mail', 'lawyerEmail']],
  court: [['Gericht', 'court', 'court'], ['Ort', 'courtLocation'], ['Gerichtliches Aktenzeichen', 'courtReference']],
  procedure: [['Verfahrensart', 'procedureType'], ['Verfahrensstand', 'proceedingStage'], ['Instanz', 'instance'], ['Beginn des Falls', 'startedAt', 'date']],
}

const titles = {
  description: 'Sachverhalt bearbeiten',
  financial: 'Finanziellen Überblick bearbeiten',
  information: 'Fallinformationen bearbeiten',
  parties: 'Beteiligte bearbeiten',
  lawyer: 'Rechtsanwalt / Übergabe bearbeiten',
  court: 'Gericht bearbeiten',
  procedure: 'Verfahren bearbeiten',
}

function initialValue(legalDispute, section) {
  if (section === 'description') return { description: legalDispute.description || '' }
  const fields = fieldsBySection[section] || []
  return Object.fromEntries(fields.map(([, field]) => [field, legalDispute[field] ?? '']).concat(section === 'information' ? [['status', legalDispute.status || 'open']] : section === 'parties' ? [['counterparty', legalDispute.counterparty || ''], ['counterpartyPartnerId', legalDispute.counterpartyPartnerId || null], ['counterpartyPartnerRole', legalDispute.counterpartyPartnerRole || null]] : []))
}

export default function LegalDisputeEditModal({ legalDispute, section, onCancel, onSubmit }) {
  const { canView } = usePermissions()
  const canViewMasterData = canView('masterData')
  const [partners, setPartners] = useState([])
  const [partnersLoading, setPartnersLoading] = useState(section === 'parties' && canViewMasterData)
  const [partnersError, setPartnersError] = useState('')
  const [form, setForm] = useState(() => initialValue(legalDispute, section))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fields = fieldsBySection[section] || []

  useEffect(() => {
    let current = true
    if (section === 'parties' && canViewMasterData) listBusinessPartners().then((entries) => { if (current) setPartners(entries) }).catch((error) => {
      if (current) setPartnersError('Die Gegenseiten-Auswahl konnte nicht geladen werden. Bitte das Fenster erneut öffnen.')
      void reportTechnicalFailure({ module: 'legal-disputes', stage: 'load-counterparty-options', error, recordId: legalDispute.id })
    }).finally(() => { if (current) setPartnersLoading(false) })
    return () => { current = false }
  }, [canViewMasterData, legalDispute.id, section])

  function update(field, value) { setForm((current) => ({ ...current, [field]: value })) }

  async function save(event) {
    event.preventDefault()
    setSaving(true); setError('')
    try { await onSubmit(form) } catch (saveError) { setError(saveError.message || 'Die Änderung konnte nicht gespeichert werden.') } finally { setSaving(false) }
  }

  return <div className="document-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onCancel() }}><section className="todo-quick-edit-modal legal-dispute-edit-modal" role="dialog" aria-modal="true" aria-labelledby="legal-dispute-edit-title"><form className="todo-quick-editor" onSubmit={save}><div className="todo-quick-editor__heading"><h2 id="legal-dispute-edit-title">{titles[section]}</h2></div>{section === 'description' ? <label className="form-field"><span><StaticText source={"Sachverhalt"} /></span><textarea rows="8" value={form.description} onChange={(event) => update('description', event.target.value)} autoFocus /></label> : <div className="legal-dispute-edit-modal__grid">{section === 'information' && <p className="form-field__hint"><StaticText source="Die Zuständigkeit wird im Bereich Termine & Fristen über die Nutzerauswahl geändert." /></p>}{section === 'information' && <label className="form-field"><span>Status</span><select value={form.status} onChange={(event) => update('status', event.target.value)}><option value="open"><StaticText source={"Offen"} /></option><option value="completed"><StaticText source={"Abgeschlossen"} /></option></select></label>}{section === 'parties' && <LegalDisputeCounterpartyField allowLegacyText value={form} partners={partners} canViewMasterData={canViewMasterData} disabled={saving || partnersLoading || Boolean(partnersError)} onChange={(changes) => setForm((current) => ({ ...current, ...changes }))} />}{fields.map(([label, field, type]) => <label className="form-field" key={field}><span>{label}</span>{type === 'representation' ? <select value={form[field]} onChange={(event) => update(field, event.target.value)}><option value=""><StaticText source={"Auswahl"} /></option><option value="self_represented"><StaticText source={"Vertritt sich selbst"} /></option><option value="lawyer"><StaticText source={"Durch Anwalt vertreten"} /></option></select> : type === 'court' ? <select value={form[field]} onChange={(event) => update(field, event.target.value)}><option value=""><StaticText source={"Auswahl"} /></option>{form[field] && !courtTypes.includes(form[field]) && <option value={form[field]}>{form[field]}</option>}{courtTypes.map((courtType) => <option key={courtType} value={courtType}>{courtType}</option>)}</select> : <input type={section === 'financial' ? 'number' : type || 'text'} min={section === 'financial' ? '0' : undefined} step={section === 'financial' ? '0.01' : undefined} value={form[field]} onChange={(event) => update(field, event.target.value)} />}</label>)}</div>}{partnersLoading && <p className="page-state"><StaticText source="Gegenseiten werden geladen …" /></p>}{partnersError && <p className="form-error"><StaticText source={partnersError} /></p>}{error && <p className="form-error">{<StaticText source={error} />}</p>}<div className="form-actions"><button className="button button--secondary" type="button" disabled={saving} onClick={onCancel}><StaticText source={"Abbrechen"} /></button><button className="button" type="submit" disabled={saving}>{<StaticText source={saving ? 'Wird gespeichert …' : 'Speichern'} />}</button></div></form></section></div>
}
