import { useState } from 'react'
import { formatPersonnelVacationDate } from '../../lib/personnelVacationFormat.js'

const vacationTypeLabels = { normal: 'Normal', overtime: 'Überstundenabbau', special: 'Sonderurlaub' }
const vacationStatusLabels = { pending: 'Ausstehend', approved: 'Genehmigt', rejected: 'Abgelehnt', cancelled: 'Storniert', withdrawn: 'Zurückgezogen' }

export function PersonnelVacationTable({ vacations, includeEmployee = true, editable = false, onEdit }) {
  const columns = (includeEmployee ? 9 : 7) + (editable ? 1 : 0)
  return <div className="personnel-vacation-table table-frame"><table><thead><tr>{includeEmployee && <><th>Mitarbeiter</th><th>Abteilung</th></>}<th>Von</th><th>Bis</th><th>Urlaubstage</th><th>Urlaubsart</th><th>Status</th><th>Lohnbuchhaltung</th><th>HR-Bemerkung</th>{editable && <th aria-label="Aktionen" />}</tr></thead><tbody>
    {vacations.length ? vacations.map((vacation) => <tr className={vacation.status === 'approved' && !vacation.payrollProcessed ? 'personnel-vacation-table__row--open' : ''} key={vacation.vacationId}>{includeEmployee && <><td><strong>{vacation.employeeName}</strong></td><td>{vacation.department}</td></>}<td>{formatPersonnelVacationDate(vacation.startDate)}</td><td>{formatPersonnelVacationDate(vacation.endDate)}</td><td>{vacation.days}</td><td>{vacationTypeLabels[vacation.vacationType] || 'Normal'}</td><td><span className={`personnel-vacation-status personnel-vacation-status--${vacation.status}`}>{vacationStatusLabels[vacation.status] || 'Ausstehend'}</span></td><td><span className={vacation.payrollProcessed ? 'personnel-payroll personnel-payroll--done' : 'personnel-payroll personnel-payroll--open'}>{vacation.payrollProcessed ? 'Erledigt' : 'Offen'}</span></td><td className="personnel-vacation-table__note" title={vacation.hrNote || undefined}>{vacation.hrNote || '—'}</td>{editable && <td className="personnel-vacation-table__action"><button className="button button--secondary" type="button" onClick={() => onEdit(vacation)}>Pflegen</button></td>}</tr>) : <tr><td colSpan={columns} className="table-state">Keine Urlaube für diese Auswahl vorhanden.</td></tr>}
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
