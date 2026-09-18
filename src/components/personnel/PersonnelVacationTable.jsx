import { useState } from 'react'
import { formatPersonnelVacationDate } from '../../lib/personnelVacationFormat.js'

const vacationTypeLabels = { normal: 'Normal', overtime: 'Überstundenabbau', special: 'Sonderurlaub', adjustment: 'Ausgleich' }
const vacationStatusLabels = { pending: 'Ausstehend', approved: 'Genehmigt', rejected: 'Abgelehnt', cancelled: 'Storniert', withdrawn: 'Zurückgezogen', manual: 'Manuell' }

export function PersonnelVacationTable({ vacations, includeEmployee = true, editable = false, onEdit, onEditManualVacation }) {
  const columns = includeEmployee ? 9 : 7
  return <div className={`personnel-vacation-table personnel-vacation-table--${includeEmployee ? 'with-employee' : 'detail'} table-frame`}><table className="data-table"><thead><tr>{includeEmployee && <><th>Mitarbeiter</th><th>Abteilung</th></>}<th>Von</th><th>Bis</th><th>Tage</th><th>Urlaubsart</th><th>Status</th><th>Lohnbuchhaltung</th><th>HR-Bemerkung</th></tr></thead><tbody>
    {vacations.length ? vacations.map((vacation) => {
      const isHrManualVacation = vacation.hrManualEntry === true
      const canEditVacation = editable && (isHrManualVacation ? Boolean(onEditManualVacation) : !vacation.isManual)
      const openVacation = () => { if (isHrManualVacation) onEditManualVacation(vacation); else onEdit(vacation) }
      const actionLabel = isHrManualVacation ? `Manuell erfassten Urlaub vom ${formatPersonnelVacationDate(vacation.startDate)} bearbeiten` : `HR-Informationen für Urlaub vom ${formatPersonnelVacationDate(vacation.startDate)} pflegen`
      return <tr className={`${vacation.status === 'approved' && !vacation.payrollProcessed ? 'personnel-vacation-table__row--open' : ''}${canEditVacation ? ' personnel-vacation-table__row--link' : ''}`} key={vacation.vacationId} role={canEditVacation ? 'button' : undefined} tabIndex={canEditVacation ? 0 : undefined} aria-label={canEditVacation ? actionLabel : undefined} onClick={canEditVacation ? openVacation : undefined} onKeyDown={canEditVacation ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openVacation() } } : undefined}>{includeEmployee && <><td><strong>{vacation.employeeName}</strong></td><td>{vacation.department}</td></>}<td>{formatPersonnelVacationDate(vacation.startDate)}</td><td>{formatPersonnelVacationDate(vacation.endDate)}</td><td>{vacation.days > 0 && vacation.isManual ? `+${vacation.days}` : vacation.days}</td><td>{vacationTypeLabels[vacation.vacationType] || 'Normal'}</td><td><span className={`personnel-vacation-status personnel-vacation-status--${vacation.status}`}>{vacationStatusLabels[vacation.status] || 'Ausstehend'}</span></td><td><span className={vacation.payrollProcessed ? 'personnel-payroll personnel-payroll--done' : 'personnel-payroll personnel-payroll--open'}>{vacation.payrollProcessed ? 'Erledigt' : 'Offen'}</span></td><td className="personnel-vacation-table__note">{isHrManualVacation ? vacation.managerComment || '—' : vacation.hrNote || '—'}</td></tr>
    }) : <tr><td colSpan={columns} className="table-state">Keine Urlaube für diese Auswahl vorhanden.</td></tr>}
  </tbody></table></div>
}

export function PersonnelVacationMetaModal({ vacation, saving, onClose, onSave }) {
  const [payrollProcessed, setPayrollProcessed] = useState(vacation.payrollProcessed === true)
  const [hrNote, setHrNote] = useState(vacation.hrNote || '')

  function submit(event) {
    event.preventDefault()
    onSave({ payrollProcessed, hrNote })
  }

  return <div className="personnel-vacation-modal-backdrop" role="presentation" onMouseDown={(event) => { if (!saving && event.target === event.currentTarget) onClose() }}><form className="personnel-vacation-modal" onSubmit={submit} aria-modal="true" role="dialog" aria-labelledby="personnel-vacation-meta-title"><div className="personnel-vacation-modal__heading"><div><h2 id="personnel-vacation-meta-title">HR-Informationen pflegen</h2><p>{vacation.employeeName} · {formatPersonnelVacationDate(vacation.startDate)} – {formatPersonnelVacationDate(vacation.endDate)}</p></div></div><label className="personnel-payroll-toggle"><input type="checkbox" checked={payrollProcessed} onChange={(event) => setPayrollProcessed(event.target.checked)} disabled={saving} /><span><strong>In Lohnbuchhaltung berücksichtigt</strong><small>{payrollProcessed ? 'Als erledigt markiert' : 'Noch offen'}</small></span></label><label className="form-field"><span>Interne HR-Bemerkung</span><textarea rows="5" maxLength="3000" value={hrNote} onChange={(event) => setHrNote(event.target.value)} disabled={saving} /></label><div className="personnel-vacation-modal__actions"><button className="button button--secondary" type="button" onClick={onClose} disabled={saving}>Abbrechen</button><button className="button" type="submit" disabled={saving}>{saving ? 'Wird gespeichert …' : 'Speichern'}</button></div></form></div>
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

  return <div className="personnel-vacation-modal-backdrop" role="presentation" onMouseDown={(event) => { if (!saving && event.target === event.currentTarget) onClose() }}><form className="personnel-vacation-modal" onSubmit={submit} aria-modal="true" role="dialog" aria-labelledby="personnel-vacation-adjustment-title"><div className="personnel-vacation-modal__heading"><h2 id="personnel-vacation-adjustment-title">Urlaubsausgleich hinzufügen</h2></div><div className="personnel-vacation-modal__grid"><label className="form-field"><span>Datum</span><input type="date" required value={adjustmentDate} onChange={(event) => setAdjustmentDate(event.target.value)} disabled={saving} /></label><label className="form-field"><span>Tage</span><input type="number" required min="0.5" max="366" step="0.5" value={days} onChange={(event) => setDays(event.target.value)} disabled={saving} /></label><label className="form-field"><span>Ausgleich</span><select value={direction} onChange={(event) => setDirection(event.target.value)} disabled={saving}><option value="deduct">Abzug</option><option value="add">Hinzufügen</option></select></label></div><label className="personnel-payroll-toggle"><input type="checkbox" checked={payrollProcessed} onChange={(event) => setPayrollProcessed(event.target.checked)} disabled={saving} /><span><strong>In Lohnbuchhaltung berücksichtigt</strong><small>{payrollProcessed ? 'Als erledigt markiert' : 'Noch offen'}</small></span></label><label className="form-field"><span>Bemerkung</span><textarea required rows="5" maxLength="3000" value={hrNote} onChange={(event) => setHrNote(event.target.value)} disabled={saving} /></label><div className="personnel-vacation-modal__actions"><button className="button button--secondary" type="button" onClick={onClose} disabled={saving}>Abbrechen</button><button className="button" type="submit" disabled={saving}>{saving ? 'Wird gespeichert …' : 'Ausgleich hinzufügen'}</button></div></form></div>
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

  return <div className="personnel-vacation-modal-backdrop" role="presentation" onMouseDown={(event) => { if (!saving && event.target === event.currentTarget) onClose() }}><form className="personnel-vacation-modal" onSubmit={submit} aria-modal="true" role="dialog" aria-labelledby="personnel-manual-vacation-title"><div className="personnel-vacation-modal__heading"><h2 id="personnel-manual-vacation-title">{isExisting ? 'Manuell erfassten Urlaub bearbeiten' : 'Urlaub hinzufügen'}</h2></div><div className="personnel-vacation-modal__grid"><label className="form-field"><span>Von</span><input type="date" required value={startDate} onChange={(event) => { setStartDate(event.target.value); if (event.target.value > endDate) setEndDate(event.target.value) }} disabled={saving || isWithdrawn} /></label><label className="form-field"><span>Bis</span><input type="date" required min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} disabled={saving || isWithdrawn} /></label><label className="form-field"><span>Tage</span><input type="number" required min="0.5" max="366" step="0.5" value={days} onChange={(event) => setDays(event.target.value)} disabled={saving || isWithdrawn} /></label></div><label className="form-field"><span>Kommentar des Genehmigers</span><textarea required rows="5" maxLength="3000" value={managerComment} onChange={(event) => setManagerComment(event.target.value)} disabled={saving || isWithdrawn} /></label><div className="personnel-vacation-modal__actions"><button className="button button--secondary" type="button" onClick={onClose} disabled={saving}>Abbrechen</button>{isExisting && <button className="button button--secondary" type="button" onClick={() => changeStatus(isWithdrawn ? 'manual' : 'withdrawn')} disabled={saving}>{isWithdrawn ? 'Reaktivieren' : 'Zurückziehen'}</button>}{!isWithdrawn && <button className="button" type="submit" disabled={saving}>{saving ? 'Wird gespeichert …' : isExisting ? 'Änderungen speichern' : 'Urlaub hinzufügen'}</button>}</div></form></div>
}
