import { useMemo, useState } from 'react'
import { CheckIcon, CloseIcon, EditIcon, TrashIcon } from '../icons.jsx'
import { createEmptyInsolvencyClaim, createEmptyInsolvencyQuotaPayment } from '../../lib/insolvencies.js'

function formatCurrency(value) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(value) || 0)
}

function formatDate(value) {
  return value ? new Intl.DateTimeFormat('de-DE').format(new Date(`${value}T12:00:00`)) : '—'
}

function grossAmount(values) {
  const net = Number(values.netAmount)
  const vat = Number(values.vatAmount)
  return (Number.isFinite(net) ? net : 0) + (Number.isFinite(vat) ? vat : 0)
}

function sum(items, field, predicate = () => true) {
  return items.filter(predicate).reduce((total, item) => total + (Number(item[field]) || 0), 0)
}

function ClaimTableColumns({ canEdit }) {
  return <colgroup><col className="insolvency-claims-overview__identifier-column" /><col className="insolvency-claims-overview__amount-column" /><col className="insolvency-claims-overview__amount-column" /><col className="insolvency-claims-overview__amount-column" /><col className="insolvency-claims-overview__registration-column" />{canEdit && <col className="insolvency-claims-overview__actions-column" />}</colgroup>
}

function PaymentTableColumns({ canEdit }) {
  return <colgroup><col className="insolvency-claims-overview__identifier-column" /><col className="insolvency-claims-overview__amount-column" /><col className="insolvency-claims-overview__amount-column" /><col className="insolvency-claims-overview__amount-column" /><col className="insolvency-claims-overview__spacer-column" />{canEdit && <col className="insolvency-claims-overview__actions-column" />}</colgroup>
}

function Actions({ editing, disabled, onEdit, onDelete, onSave, onCancel }) {
  return <td className="insolvency-claims-overview__actions"><div className="insolvency-claims-overview__action-icons">{editing ? <><button className="insolvency-claims-overview__icon insolvency-claims-overview__icon--save" type="button" disabled={disabled} onClick={onSave} title="Speichern" aria-label="Speichern"><CheckIcon size={16} /></button><button className="insolvency-claims-overview__icon insolvency-claims-overview__icon--cancel" type="button" disabled={disabled} onClick={onCancel} title="Abbrechen" aria-label="Abbrechen"><CloseIcon size={16} /></button></> : <><button className="insolvency-claims-overview__icon" type="button" disabled={disabled} onClick={onEdit} title="Bearbeiten" aria-label="Bearbeiten"><EditIcon size={16} /></button><button className="insolvency-claims-overview__icon insolvency-claims-overview__icon--delete" type="button" disabled={disabled} onClick={onDelete} title="Löschen" aria-label="Löschen"><TrashIcon size={16} /></button></>}</div></td>
}

function ClaimFields({ values, onChange }) {
  return <><td><input aria-label="Rechnungsnummer" maxLength="240" value={values.invoiceNumber} onChange={(event) => onChange('invoiceNumber', event.target.value)} /></td><td><input aria-label="Netto" type="number" min="0" step="0.01" value={values.netAmount} onChange={(event) => onChange('netAmount', event.target.value)} /></td><td><input aria-label="Umsatzsteuer" type="number" min="0" step="0.01" value={values.vatAmount} onChange={(event) => onChange('vatAmount', event.target.value)} /></td><td className="insolvency-claims-overview__amount">{formatCurrency(grossAmount(values))}</td><td><select aria-label="Zur Insolvenztabelle angemeldet" value={values.filedInInsolvencyTable ? 'yes' : 'no'} onChange={(event) => onChange('filedInInsolvencyTable', event.target.value === 'yes')}><option value="no">Nein</option><option value="yes">Ja</option></select></td></>
}

function PaymentFields({ values, onChange }) {
  return <><td><input aria-label="Datum" type="date" value={values.paymentDate} onChange={(event) => onChange('paymentDate', event.target.value)} /></td><td><input aria-label="Netto" type="number" min="0" step="0.01" value={values.netAmount} onChange={(event) => onChange('netAmount', event.target.value)} /></td><td><input aria-label="Umsatzsteuer" type="number" min="0" step="0.01" value={values.vatAmount} onChange={(event) => onChange('vatAmount', event.target.value)} /></td><td className="insolvency-claims-overview__amount">{formatCurrency(grossAmount(values))}</td></>
}

export default function InsolvencyClaimsOverview({ canEdit, claims, quotaPayments, loading, onSaveClaim, onDeleteClaim, onSaveQuotaPayment, onDeleteQuotaPayment }) {
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const registeredClaims = useMemo(() => sum(claims, 'grossAmount', (claim) => claim.filedInInsolvencyTable === true), [claims])
  const totalClaimsNet = useMemo(() => sum(claims, 'netAmount'), [claims])
  const totalClaimsGross = useMemo(() => sum(claims, 'grossAmount'), [claims])
  const totalClaimsVat = useMemo(() => sum(claims, 'vatAmount'), [claims])
  const quotaPaymentsGross = useMemo(() => sum(quotaPayments, 'grossAmount'), [quotaPayments])
  const estimatedLossNet = useMemo(() => sum(claims, 'netAmount') - sum(quotaPayments, 'netAmount'), [claims, quotaPayments])

  function startNew(type) {
    setError('')
    setDraft({ type, mode: 'new', values: type === 'claim' ? createEmptyInsolvencyClaim() : createEmptyInsolvencyQuotaPayment() })
  }

  function startEdit(type, item) {
    setError('')
    const values = type === 'claim'
      ? { invoiceNumber: item.invoiceNumber, netAmount: item.netAmount, vatAmount: item.vatAmount, filedInInsolvencyTable: item.filedInInsolvencyTable === true }
      : { paymentDate: item.paymentDate, netAmount: item.netAmount, vatAmount: item.vatAmount }
    setDraft({ type, mode: 'edit', item, values })
  }

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, values: { ...current.values, [field]: value } }))
    setError('')
  }

  async function saveDraft() {
    if (!draft) return
    setSaving(true)
    setError('')
    try {
      if (draft.type === 'claim') await onSaveClaim(draft.mode === 'edit' ? draft.item : null, draft.values)
      else await onSaveQuotaPayment(draft.mode === 'edit' ? draft.item : null, draft.values)
      setDraft(null)
    } catch (saveError) {
      setError(saveError.message || 'Die Angaben konnten nicht gespeichert werden.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(type, item) {
    setSaving(true)
    setError('')
    try {
      if (type === 'claim') await onDeleteClaim(item)
      else await onDeleteQuotaPayment(item)
    } catch (deleteError) {
      setError(deleteError.message || 'Der Eintrag konnte nicht gelöscht werden.')
    } finally {
      setSaving(false)
    }
  }

  const claimColumns = canEdit ? 6 : 5
  const paymentColumns = canEdit ? 6 : 5
  const draftClaim = draft?.type === 'claim'
  const draftPayment = draft?.type === 'payment'

  return <section className="todo-detail-content insolvency-claims-overview" aria-label="Forderungsübersicht">
    <section className="insolvency-claims-overview__section" aria-labelledby="insolvency-claims-title">
      <div className="todo-detail-section-heading"><h3 id="insolvency-claims-title">Offene Forderungen</h3>{canEdit && <button className="button insolvency-claims-overview__add" type="button" disabled={Boolean(draft) || saving} onClick={() => startNew('claim')}>Rechnung hinzufügen</button>}</div>
      {error && draftClaim && <p className="form-error">{error}</p>}
      <div className="todos-table-frame insolvency-claims-overview__table-frame"><table className="todos-table insolvency-claims-overview__table insolvency-claims-overview__table--claims"><ClaimTableColumns canEdit={canEdit} /><thead><tr><th>Rg.-Nr.</th><th>Netto</th><th>UST</th><th>Brutto</th><th>Angemeldet?</th>{canEdit && <th><span className="sr-only">Aktionen</span></th>}</tr></thead><tbody>
        {loading ? <tr><td className="table-state" colSpan={claimColumns}>Offene Forderungen werden geladen …</td></tr> : !claims.length && !draftClaim ? <tr><td className="table-state" colSpan={claimColumns}>Noch keine offenen Forderungen hinterlegt.</td></tr> : claims.map((claim) => {
          const editing = draft?.type === 'claim' && draft.mode === 'edit' && draft.item.id === claim.id
          return <tr key={claim.id} className={editing ? 'insolvency-claims-overview__row--editing' : ''}>{editing ? <><ClaimFields values={draft.values} onChange={updateDraft} /><Actions editing disabled={saving} onSave={saveDraft} onCancel={() => setDraft(null)} /></> : <><td>{claim.invoiceNumber}</td><td className="insolvency-claims-overview__amount">{formatCurrency(claim.netAmount)}</td><td className="insolvency-claims-overview__amount">{formatCurrency(claim.vatAmount)}</td><td className="insolvency-claims-overview__amount insolvency-claims-overview__amount--gross">{formatCurrency(claim.grossAmount)}</td><td>{claim.filedInInsolvencyTable ? 'Ja' : 'Nein'}</td>{canEdit && <Actions disabled={Boolean(draft) || saving} onEdit={() => startEdit('claim', claim)} onDelete={() => remove('claim', claim)} />}</>}</tr>
        })}
        {canEdit && draftClaim && draft.mode === 'new' && <tr className="insolvency-claims-overview__row--editing"><ClaimFields values={draft.values} onChange={updateDraft} /><Actions editing disabled={saving} onSave={saveDraft} onCancel={() => setDraft(null)} /></tr>}
      </tbody></table></div>
    </section>
    <section className="insolvency-claims-overview__section insolvency-claims-overview__section--payments" aria-labelledby="insolvency-quota-payments-title">
      <div className="todo-detail-section-heading"><h3 id="insolvency-quota-payments-title">Quotenzahlungen</h3>{canEdit && <button className="button insolvency-claims-overview__add" type="button" disabled={Boolean(draft) || saving} onClick={() => startNew('payment')}>Quotenzahlung hinzufügen</button>}</div>
      {error && draftPayment && <p className="form-error">{error}</p>}
      <div className="todos-table-frame insolvency-claims-overview__table-frame"><table className="todos-table insolvency-claims-overview__table insolvency-claims-overview__table--payments"><PaymentTableColumns canEdit={canEdit} /><thead><tr><th>Datum</th><th>Netto</th><th>UST</th><th>Brutto</th><th className="insolvency-claims-overview__spacer" aria-hidden="true" />{canEdit && <th><span className="sr-only">Aktionen</span></th>}</tr></thead><tbody>
        {loading ? <tr><td className="table-state" colSpan={paymentColumns}>Quotenzahlungen werden geladen …</td></tr> : !quotaPayments.length && !draftPayment ? <tr><td className="table-state" colSpan={paymentColumns}>Noch keine Quotenzahlungen erhalten.</td></tr> : quotaPayments.map((payment) => {
          const editing = draft?.type === 'payment' && draft.mode === 'edit' && draft.item.id === payment.id
          return <tr key={payment.id} className={editing ? 'insolvency-claims-overview__row--editing' : ''}>{editing ? <><PaymentFields values={draft.values} onChange={updateDraft} /><td className="insolvency-claims-overview__spacer" aria-hidden="true" /><Actions editing disabled={saving} onSave={saveDraft} onCancel={() => setDraft(null)} /></> : <><td>{formatDate(payment.paymentDate)}</td><td className="insolvency-claims-overview__amount">{formatCurrency(payment.netAmount)}</td><td className="insolvency-claims-overview__amount">{formatCurrency(payment.vatAmount)}</td><td className="insolvency-claims-overview__amount insolvency-claims-overview__amount--gross">{formatCurrency(payment.grossAmount)}</td><td className="insolvency-claims-overview__spacer" aria-hidden="true" />{canEdit && <Actions disabled={Boolean(draft) || saving} onEdit={() => startEdit('payment', payment)} onDelete={() => remove('payment', payment)} />}</>}</tr>
        })}
        {canEdit && draftPayment && draft.mode === 'new' && <tr className="insolvency-claims-overview__row--editing"><PaymentFields values={draft.values} onChange={updateDraft} /><td className="insolvency-claims-overview__spacer" aria-hidden="true" /><Actions editing disabled={saving} onSave={saveDraft} onCancel={() => setDraft(null)} /></tr>}
      </tbody></table></div>
    </section>
    <div className="insolvency-claims-overview__summary" aria-label="Finanzielle Zusammenfassung"><div><span>Gesamt Netto</span><strong>{formatCurrency(totalClaimsNet)}</strong></div><div><span>Gesamt Brutto</span><strong>{formatCurrency(totalClaimsGross)}</strong></div><div><span>Enthaltene UST</span><strong>{formatCurrency(totalClaimsVat)}</strong></div><div><span>Angemeldet Brutto</span><strong>{formatCurrency(registeredClaims)}</strong></div><div><span>Inso.-Zahlung</span><strong>{formatCurrency(quotaPaymentsGross)}</strong></div><div><span>Verlust Netto</span><strong className={estimatedLossNet > 0 ? 'insolvency-claims-overview__amount--loss' : ''}>{formatCurrency(estimatedLossNet)}</strong></div></div>
  </section>
}
