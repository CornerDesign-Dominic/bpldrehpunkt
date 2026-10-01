import { StaticText } from '../../i18n/AutoTranslate.jsx'
import { useState } from 'react'
import { formatPersonnelVacationDate } from '../../lib/personnelVacationFormat.js'

const vacationTypeLabels = { normal: 'Normal', overtime: 'Überstundenabbau', special: 'Sonderurlaub', adjustment: 'Ausgleich' }
const vacationStatusLabels = { pending: 'Ausstehend', approved: 'Genehmigt', rejected: 'Abgelehnt', cancelled: 'Storniert', withdrawn: 'Zurückgezogen', manual: 'Manuell' }

export function PersonnelVacationTable({ vacations, includeEmployee = true, editable = false, onEdit, onEditManualVacation }) {
  const columns = includeEmployee ? 9 : 7
  return <div className={`personnel-vacation-table personnel-vacation-table--${includeEmployee ? 'with-employee' : 'detail'} table-frame`}><table className="data-table"><thead><tr>{includeEmployee && <><th><StaticText source={"Mitarbeiter"} /></th><th><StaticText source={"Abteilung"} /></th></>}<th><StaticText source={"Von"} /></th><th><StaticText source={"Bis"} /></th><th><StaticText source={"Tage"} /></th><th><StaticText source={"Urlaubsart"} /></th><th>Status</th><th><StaticText source={"Lohnbuchhaltung"} /></th><th><StaticText source={"HR-Bemerkung"} /></th></tr></thead><tbody>
    {vacations.length ? vacations.map((vacation) => {
      const isHrManualVacation = vacation.hrManualEntry === true
      const canEditVacation = editable && (isHrManualVacation ? Boolean(onEditManualVacation) : !vacation.isManual)
      const openVacation = () => { if (isHrManualVacation) onEditManualVacation(vacation); else onEdit(vacation) }
      const actionLabel = isHrManualVacation ? `Manuell erfassten Urlaub vom ${formatPersonnelVacationDate(vacation.startDate)} bearbeiten` : `HR-Informationen für Urlaub vom ${formatPersonnelVacationDate(vacation.startDate)} pflegen`
      return <tr className={`${vacation.status === 'approved' && !vacation.payrollProcessed ? 'personnel-vacation-table__row--open' : ''}${canEditVacation ? ' personnel-vacation-table__row--link' : ''}`} key={vacation.vacationId} role={canEditVacation ? 'button' : undefined} tabIndex={canEditVacation ? 0 : undefined} aria-label={canEditVacation ? actionLabel : undefined} onClick={canEditVacation ? openVacation : undefined} onKeyDown={canEditVacation ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openVacation() } } : undefined}>{includeEmployee && <><td><strong>{vacation.employeeName}</strong></td><td>{vacation.department}</td></>}<td>{formatPersonnelVacationDate(vacation.startDate)}</td><td>{formatPersonnelVacationDate(vacation.endDate)}</td><td>{vacation.days > 0 && vacation.isManual ? `+${vacation.days}` : vacation.days}</td><td>{vacationTypeLabels[vacation.vacationType] || 'Normal'}</td><td><span className={`personnel-vacation-status personnel-vacation-status--${vacation.status}`}>{<StaticText source={vacationStatusLabels[vacation.status] || 'Ausstehend'} />}</span></td><td><span className={vacation.payrollProcessed ? 'personnel-payroll personnel-payroll--done' : 'personnel-payroll personnel-payroll--open'}>{<StaticText source={vacation.payrollProcessed ? 'Erledigt' : 'Offen'} />}</span></td><td className="personnel-vacation-table__note">{isHrManualVacation ? vacation.managerComment || '—' : vacation.hrNote || '—'}</td></tr>
    }) : <tr><td colSpan={columns} className="table-state"><StaticText source={"Keine Urlaube für diese Auswahl vorhanden."} /></td></tr>}
  </tbody></table></div>
}

export function PersonnelVacationMetaModal({ vacation, saving, onClose, onSave }) {
  const [payrollProcessed, setPayrollProcessed] = useState(vacation.payrollProcessed === true)
  const [hrNote, setHrNote] = useState(vacation.hrNote || '')

  function submit(event) {
    event.preventDefault()
    onSave({ payrollProcessed, hrNote })
  }

  return <div className="personnel-vacation-modal-backdrop" role="presentation" onMouseDown={(event) => { if (!saving && event.target === event.currentTarget) onClose() }}><form className="personnel-vacation-modal" onSubmit={submit} aria-modal="true" role="dialog" aria-labelledby="personnel-vacation-meta-title"><div className="personnel-vacation-modal__heading"><div><h2 id="personnel-vacation-meta-title"><StaticText source={"HR-Informationen pflegen"} /></h2><p>{vacation.employeeName} · {formatPersonnelVacationDate(vacation.startDate)} – {formatPersonnelVacationDate(vacation.endDate)}</p></div></div><label className="personnel-payroll-toggle"><input type="checkbox" checked={payrollProcessed} onChange={(event) => setPayrollProcessed(event.target.checked)} disabled={saving} /><span><strong><StaticText source={"In Lohnbuchhaltung berücksichtigt"} /></strong><small>{<StaticText source={payrollProcessed ? 'Als erledigt markiert' : 'Noch offen'} />}</small></span></label><label className="form-field"><span><StaticText source={"Interne HR-Bemerkung"} /></span><textarea rows="5" maxLength="3000" value={hrNote} onChange={(event) => setHrNote(event.target.value)} disabled={saving} /></label><div className="personnel-vacation-modal__actions"><button className="button button--secondary" type="button" onClick={onClose} disabled={saving}><StaticText source={"Abbrechen"} /></button><button className="button" type="submit" disabled={saving}>{<StaticText source={saving ? 'Wird gespeichert …' : 'Speichern'} />}</button></div></form></div>
}

export function PersonnelVacationAdjustmentModal({ saving, onClose, onSave }) {
  const [adjustmentDate, setAdjustmentDate] = useState(new Date().toISOString().slice(0, 10))
  const [days, setDays] = useState('')
  const [direction, setDirection] = useState('deduct')
  const [payrollProcessed, setPayrollProcessed] = useState(false)
  const [hrNote, setHrNote] = useState('')

  function submit(event) {
    event.preventDefault()
    onSave({ adjustmentDate, days, direction, payrollProcessed, hrNote })
  }

  return <div className="personnel-vacation-modal-backdrop" role="presentation" onMouseDown={(event) => { if (!saving && event.target === event.currentTarget) onClose() }}><form className="personnel-vacation-modal" onSubmit={submit} aria-modal="true" role="dialog" aria-labelledby="personnel-vacation-adjustment-title"><div className="personnel-vacation-modal__heading"><h2 id="personnel-vacation-adjustment-title"><StaticText source={"Urlaubsausgleich hinzufügen"} /></h2></div><div className="personnel-vacation-modal__grid"><label className="form-field"><span><StaticText source={"Datum"} /></span><input type="date" required value={adjustmentDate} onChange={(event) => setAdjustmentDate(event.target.value)} disabled={saving} /></label><label className="form-field"><span><StaticText source={"Tage"} /></span><input type="number" required min="0.5" max="366" step="0.5" value={days} onChange={(event) => setDays(event.target.value)} disabled={saving} /></label><label className="form-field"><span><StaticText source={"Ausgleich"} /></span><select value={direction} onChange={(event) => setDirection(event.target.value)} disabled={saving}><option value="deduct"><StaticText source={"Abzug"} /></option><option value="add"><StaticText source={"Hinzufügen"} /></option></select></label></div><label className="personnel-payroll-toggle"><input type="checkbox" checked={payrollProcessed} onChange={(event) => setPayrollProcessed(event.target.checked)} disabled={saving} /><span><strong><StaticText source={"In Lohnbuchhaltung berücksichtigt"} /></strong><small>{<StaticText source={payrollProcessed ? 'Als erledigt markiert' : 'Noch offen'} />}</small></span></label><label className="form-field"><span><StaticText source={"Bemerkung"} /></span><textarea required rows="5" maxLength="3000" value={hrNote} onChange={(event) => setHrNote(event.target.value)} disabled={saving} /></label><div className="personnel-vacation-modal__actions"><button className="button button--secondary" type="button" onClick={onClose} disabled={saving}><StaticText source={"Abbrechen"} /></button><button className="button" type="submit" disabled={saving}>{<StaticText source={saving ? 'Wird gespeichert …' : 'Ausgleich hinzufügen'} />}</button></div></form></div>
}

export function PersonnelManualVacationModal({ vacation = null, saving, onClose, onSave }) {
  const today = new Date().toISOString().slice(0, 10)
  const isExisting = Boolean(vacation)
  const isWithdrawn = vacation?.status === 'withdrawn'
  const [startDate, setStartDate] = useState(vacation?.startDate || today)
  const [endDate, setEndDate] = useState(vacation?.endDate || today)
  const [days, setDays] = useState(vacation?.days ?? '')
  const [managerComment, setManagerComment] = useState(vacation?.managerComment || '')

  function submit(event) {
    event.preventDefault()
    onSave({ startDate, endDate, days, managerComment, status: 'manual' })
  }

  function changeStatus(status) {
    onSave({ startDate, endDate, days, managerComment, status })
  }

  return <div className="personnel-vacation-modal-backdrop" role="presentation" onMouseDown={(event) => { if (!saving && event.target === event.currentTarget) onClose() }}><form className="personnel-vacation-modal" onSubmit={submit} aria-modal="true" role="dialog" aria-labelledby="personnel-manual-vacation-title"><div className="personnel-vacation-modal__heading"><h2 id="personnel-manual-vacation-title">{<StaticText source={isExisting ? 'Manuell erfassten Urlaub bearbeiten' : 'Urlaub hinzufügen'} />}</h2></div><div className="personnel-vacation-modal__grid"><label className="form-field"><span><StaticText source={"Von"} /></span><input type="date" required value={startDate} onChange={(event) => { setStartDate(event.target.value); if (event.target.value > endDate) setEndDate(event.target.value) }} disabled={saving || isWithdrawn} /></label><label className="form-field"><span><StaticText source={"Bis"} /></span><input type="date" required min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} disabled={saving || isWithdrawn} /></label><label className="form-field"><span><StaticText source={"Tage"} /></span><input type="number" required min="0.5" max="366" step="0.5" value={days} onChange={(event) => setDays(event.target.value)} disabled={saving || isWithdrawn} /></label></div><label className="form-field"><span><StaticText source={"Kommentar des Genehmigers"} /></span><textarea required rows="5" maxLength="3000" value={managerComment} onChange={(event) => setManagerComment(event.target.value)} disabled={saving || isWithdrawn} /></label><div className="personnel-vacation-modal__actions"><button className="button button--secondary" type="button" onClick={onClose} disabled={saving}><StaticText source={"Abbrechen"} /></button>{isExisting && <button className="button button--secondary" type="button" onClick={() => changeStatus(isWithdrawn ? 'manual' : 'withdrawn')} disabled={saving}>{<StaticText source={isWithdrawn ? 'Reaktivieren' : 'Zurückziehen'} />}</button>}{!isWithdrawn && <button className="button" type="submit" disabled={saving}>{<StaticText source={saving ? 'Wird gespeichert …' : isExisting ? 'Änderungen speichern' : 'Urlaub hinzufügen'} />}</button>}</div></form></div>
}
