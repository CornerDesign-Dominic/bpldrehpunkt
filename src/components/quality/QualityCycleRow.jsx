import { useEffect, useRef, useState } from 'react'
import { EditIcon } from '../icons.jsx'
import { PHASES, SMART_FIELDS, qualitySmartValues } from '../../lib/qualityPresentation.js'

const help = {
  plan: { title: 'Plan', de: 'Planen: Problem und Ursachen verstehen, ein messbares Ziel festlegen und eine geeignete Maßnahme planen. Im QMS ist dies die Grundlage, um später die Wirksamkeit zu prüfen.', en: 'Plan: Understand the problem and its causes, define a measurable goal and plan a suitable action. This gives the quality management system a basis for evaluating effectiveness.' },
  do: { title: 'Do', de: 'Umsetzen: Die geplante Maßnahme durchführen oder zunächst erproben. Zuständigkeit, Zeitraum und tatsächliche Umsetzung festhalten.', en: 'Do: Implement or test the planned action. Record responsibility, time frame and actual implementation.' },
  check: { title: 'Check', de: 'Prüfen: Ergebnisse mit dem Ziel vergleichen. Erkenntnisse, Rückmeldungen und Abweichungen festhalten: Wirkt die Maßnahme an der Ursache?', en: 'Check: Compare results with the goal. Record findings, feedback and deviations: Does the action address the cause?' },
  act: { title: 'Act', de: 'Verbessern: Aus den Erkenntnissen entscheiden. Die Maßnahme korrigieren, verwerfen oder als bewährten Standard etablieren. Daraus kann ein weiterer PDCA-Durchlauf entstehen.', en: 'Act: Decide based on the findings. Correct or discard the action, or establish it as a proven standard. This may lead to another PDCA cycle.' },
}

function PhaseHelp({ phase, language, onClose }) {
  const dialog = useRef(null)
  useEffect(() => {
    const element = dialog.current
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    element.showModal()
    document.body.style.overflow = 'hidden'
    return () => { element.close(); document.body.style.overflow = overflow; previous?.focus?.() }
  }, [])
  return <dialog ref={dialog} className="quality-dialog quality-dialog--topic" aria-labelledby="quality-help-title" onCancel={onClose}><div className="quality-heading"><h2 id="quality-help-title">{help[phase].title}</h2><button className="button button--secondary" onClick={onClose}>{language === 'en' ? 'Close' : 'Schließen'}</button></div><p>{help[phase][language === 'en' ? 'en' : 'de']}</p><a href="https://asq.org/quality-resources/pdca-cycle" target="_blank" rel="noreferrer">ASQ · PDCA</a></dialog>
}

function CompactText({ value }) {
  if (!value) return <p className="quality-protocol">—</p>
  if (value.length <= 220) return <p className="quality-protocol">{value}</p>
  return <details className="quality-expand"><summary>{value.slice(0, 180)}…</summary><p className="quality-protocol">{value}</p></details>
}

export default function QualityCycleRow({ cycle, current, editable, onEdit, language }) {
  const [helpPhase, setHelpPhase] = useState(null)
  const en = language === 'en'
  const text = (de, english) => en ? english : de
  const date = (value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString(en ? 'en-GB' : 'de-DE') : '—'
  const smart = qualitySmartValues(cycle)
  const decision = { correct: text('Korrigieren', 'Correct'), discard: text('Verwerfen', 'Discard'), establish: text('Etablieren', 'Standardize') }[cycle.actDecision]
  const period = cycle.startDate && cycle.dueDate ? `${date(cycle.startDate)} – ${date(cycle.dueDate)}` : cycle.startDate ? `${text('Ab', 'From')} ${date(cycle.startDate)}` : cycle.dueDate ? `${text('Bis', 'Until')} ${date(cycle.dueDate)}` : '—'
  const edit = (section, label) => current && editable && <button className="quality-phase-edit" aria-label={`${label} ${text('bearbeiten', 'edit')}`} title={text('Bearbeiten', 'Edit')} onClick={() => onEdit(section)}><EditIcon /></button>
  return <section className="quality-cycle-row" aria-label={`${text('Durchlauf', 'Cycle')} ${cycle.cycle}`}>
    <div className="quality-cycle-heading"><strong>{text('Durchlauf', 'Cycle')} {cycle.cycle}</strong><span>{text('Start', 'Start')} · {date(cycle.cycleStartDate)}</span>{current && <span className="quality-badge">{text('Aktuell', 'Current')}</span>}{edit('cycle', text('Zyklusstart', 'Cycle start'))}</div>
    <div className="quality-cycle-layout">
      <section className="quality-phase-panel quality-smart-card" aria-label={text('SMART-Ziel', 'SMART goal')}><header><h3>{text('SMART-Ziel', 'SMART goal')}</h3>{edit('smart', 'SMART')}</header><dl>{SMART_FIELDS.map(({ key, letter, de, en: english }) => <div key={key}><dt><b>{letter}</b><span>{en ? english : de}</span></dt><dd title={smart[key]}>{smart[key] || '—'}</dd></div>)}</dl></section>
      <div className="quality-phase-grid">{PHASES.map((phase) => <section key={phase} id={current ? `quality-phase-${phase}` : undefined} className="quality-phase-panel" tabIndex={-1} aria-label={`${phase.toUpperCase()} · ${text('Durchlauf', 'Cycle')} ${cycle.cycle}`}><header><div className="quality-phase-title"><h3>{phase.toUpperCase()}</h3><button className="quality-help" aria-label={`${phase.toUpperCase()} ${text('erklären', 'help')}`} onClick={() => setHelpPhase(phase)}>?</button></div>{edit(phase, phase.toUpperCase())}</header>
        {phase === 'do' && <div className="quality-phase-meta"><span>{cycle.owner || '—'}</span><span>{period}</span></div>}
        {phase === 'act' && (decision || cycle.actDate) && <div className="quality-phase-meta"><strong>{decision}</strong>{cycle.actDate && <span>{date(cycle.actDate)}</span>}</div>}
        <CompactText value={cycle[phase]} />
      </section>)}</div>
    </div>
    {helpPhase && <PhaseHelp phase={helpPhase} language={language} onClose={() => setHelpPhase(null)} />}
  </section>
}
