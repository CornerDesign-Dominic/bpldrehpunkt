import { useEffect, useId, useRef, useState } from 'react'
import { useLanguage } from '../../i18n/useLanguage.js'
import { allocationDraft, MAX_CONTRACT_ALLOCATIONS, normalizeContractAllocations, parseAllocationPercent } from '../../lib/contractAllocations.js'
import { contractMutationError } from '../../lib/contractPresentation.js'
import { EditIcon, TrashIcon } from '../icons.jsx'
import ConfirmDialog from '../ui/ConfirmDialog.jsx'

const errorLabels = {
  limit: ['Es sind höchstens 50 Zuordnungen möglich.', 'You can add at most 50 allocations.'],
  category: ['Bitte für jede Zuordnung eine Kostenposition wählen.', 'Select a cost category for every allocation.'],
  duplicate: ['Jede Kostenposition darf nur einmal vorkommen.', 'Each cost category can only appear once.'],
  percent: ['Bitte positive Anteile bis 100 % mit höchstens zwei Nachkommastellen eingeben.', 'Enter positive percentages up to 100%, with at most two decimal places.'],
  unresolved: ['Eine gespeicherte Kostenposition ist nicht verfügbar. Bitte die betroffene Zuordnung ersetzen oder ausdrücklich entfernen.', 'A saved category is unavailable. Replace or explicitly remove that allocation.'],
  inactive: ['Inaktive Kostenpositionen können nur mit ihrem bisherigen Anteil beibehalten werden. Bitte eine aktive Kostenposition wählen oder die Zuordnung entfernen.', 'Inactive categories can only retain their previous percentage. Select an active category or remove the allocation.'],
  total: ['Die Anteile müssen zusammen genau 100 % ergeben. Eine leere Liste hebt die Zuordnung auf.', 'Percentages must add up to exactly 100%. An empty list clears the allocation.'],
}

const rowValues = rows => rows.map(({ categoryId, percent }) => ({ categoryId, percent }))

export default function ContractAllocationCard({ contract, categories = [], editable, onSave }) {
  const { language } = useLanguage()
  const text = (de, en) => language === 'en' ? en : de
  const titleId = useId()
  const [editor, setEditor] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmClose, setConfirmClose] = useState(false)
  const attempts = useRef(new Map())
  const busy = useRef(false)
  const current = Array.isArray(contract.allocations) ? contract.allocations : []
  const categoryMap = new Map(categories.map(category => [category.id, category]))
  const dirty = editor && JSON.stringify(rowValues(editor.rows)) !== editor.initial
  const formatPercent = value => `${new Intl.NumberFormat(language === 'en' ? 'en-GB' : 'de-DE', { maximumFractionDigits: 2 }).format(value / 100)} %`

  useEffect(() => {
    if (!dirty) return undefined
    const warn = event => { event.preventDefault(); event.returnValue = '' }
    const click = event => {
      const anchor = event.target.closest('a[href]')
      if (!anchor || anchor.target === '_blank' || event.ctrlKey || event.metaKey) return
      if (busy.current || !window.confirm(language === 'en' ? 'Your cost allocation has not been saved. Leave anyway?' : 'Die Kostenzuordnung ist noch nicht gespeichert. Trotzdem verlassen?')) { event.preventDefault(); event.stopPropagation() }
    }
    window.addEventListener('beforeunload', warn)
    document.addEventListener('click', click, true)
    return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('click', click, true) }
  }, [dirty, language])

  function categoryLabel(id) {
    const category = categoryMap.get(id)
    if (!category) return text(`Nicht verfügbare Kostenposition (${id})`, `Unavailable category (${id})`)
    return `${category.name}${category.active === true ? '' : text(' (inaktiv)', ' (inactive)')}`
  }
  function edit() {
    const rows = allocationDraft(current).map(row => ({ ...row, key: crypto.randomUUID() }))
    setEditor({ rows, previous: current.map(item => ({ ...item })), revision: contract.revision || 0, initial: JSON.stringify(rowValues(rows)) })
    setError('')
  }
  function change(key, field, value) {
    setEditor(previous => ({ ...previous, rows: previous.rows.map(row => row.key === key ? { ...row, [field]: value } : row) }))
    setError('')
  }
  function cancel() {
    if (busy.current) return
    if (dirty) setConfirmClose(true)
    else setEditor(null)
  }
  async function submit(event) {
    event.preventDefault()
    if (!editable || !editor || busy.current) return
    let allocations
    try { allocations = normalizeContractAllocations(editor.rows, categories, editor.previous) }
    catch (failure) {
      const reason = String(failure.code || '').split('/').at(-1)
      setError(text(...(errorLabels[reason] || errorLabels.total)))
      return
    }
    const values = { allocations }
    const fingerprint = JSON.stringify([editor.revision, values])
    if (!attempts.current.has(fingerprint)) attempts.current.set(fingerprint, crypto.randomUUID())
    busy.current = true
    setSaving(true)
    setError('')
    try {
      await onSave(values, { expectedRevision: editor.revision, mutationId: attempts.current.get(fingerprint) })
      setEditor(null)
    } catch (failure) { setError(failure?.code === 'functions/invalid-argument' ? text('Die Zuordnung ist nicht mehr gültig. Bitte Kostenpositionen und Anteile prüfen; gegebenenfalls die Akte neu laden.', 'The allocation is no longer valid. Check the categories and percentages; reload the file if necessary.') : contractMutationError(failure, language)) }
    finally { busy.current = false; setSaving(false) }
  }

  const parsed = editor?.rows.map(row => parseAllocationPercent(row.percent)) || []
  const total = parsed.every(value => value !== null) ? parsed.reduce((sum, value) => sum + value, 0) : null
  const unresolved = editor?.rows.some(row => row.categoryId && !categoryMap.has(row.categoryId))
  return <section className="todo-detail-content contract-allocation-card" aria-labelledby={titleId}>
    <div className="todo-detail-section-heading"><h3 id={titleId}>{text('Kostenzuordnung', 'Cost allocation')}</h3>{editable && !editor && <button className="todo-detail-section-edit" type="button" title={text('Kostenzuordnung bearbeiten', 'Edit cost allocation')} aria-label={text('Kostenzuordnung bearbeiten', 'Edit cost allocation')} onClick={edit}><EditIcon size={14} /></button>}</div>
    <p className="contract-muted">{text('Die prozentuale Aufteilung gilt für den gesamten Vertrag.', 'This percentage allocation applies to the entire contract.')}</p>
    {editor && editable ? <form onSubmit={submit}>
      {unresolved && <p className="form-error" role="status">{text(...errorLabels.unresolved)}</p>}
      <div className="contracts-table-frame"><table className="data-table"><thead><tr><th scope="col">{text('Kostenposition', 'Cost category')}</th><th scope="col">{text('Anteil', 'Percentage')}</th><th scope="col"><span className="sr-only">{text('Aktionen', 'Actions')}</span></th></tr></thead><tbody>
        {!editor.rows.length && <tr><td colSpan={3} className="table-state">{text('Keine Zuordnung. Speichern hebt eine bisherige Aufteilung auf.', 'No allocation. Saving clears any previous allocation.')}</td></tr>}
        {editor.rows.map((row, index) => {
          const historical = editor.previous.some(item => item.categoryId === row.categoryId)
          const inactiveOrUnknown = historical && categoryMap.get(row.categoryId)?.active !== true
          return <tr key={row.key}>
            <td><label className="form-field"><span className="sr-only">{text(`Kostenposition ${index + 1}`, `Cost category ${index + 1}`)}</span><select required disabled={saving} value={row.categoryId} onChange={event => change(row.key, 'categoryId', event.target.value)}>
              <option value="">{text('Bitte wählen', 'Please select')}</option>
              {inactiveOrUnknown && <option value={row.categoryId}>{categoryLabel(row.categoryId)}</option>}
              {categories.filter(category => category.active === true).map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select></label></td>
            <td><label className="form-field"><span className="sr-only">{text(`Anteil in Prozent ${index + 1}`, `Percentage ${index + 1}`)}</span><input required disabled={saving} type="text" inputMode="decimal" maxLength={7} value={row.percent} onChange={event => change(row.key, 'percent', event.target.value)} /></label></td>
            <td className="contract-actions-column"><div className="contract-row-actions"><button className="button button--secondary" type="button" disabled={saving} aria-label={text(`Zuordnung ${index + 1} entfernen`, `Remove allocation ${index + 1}`)} title={text('Zuordnung entfernen', 'Remove allocation')} onClick={() => { setEditor(previous => ({ ...previous, rows: previous.rows.filter(item => item.key !== row.key) })); setError('') }}><TrashIcon size={14} /></button></div></td>
          </tr>
        })}
      </tbody></table></div>
      <p className="contract-muted" aria-live="polite">{text('Summe', 'Total')}: {total === null ? '—' : formatPercent(total)}{editor.rows.length ? text(' · erforderlich: 100 %', ' · required: 100%') : ''}</p>
      {!categories.some(category => category.active === true) && <p className="contract-muted">{text('Es sind keine aktiven Kostenpositionen verfügbar.', 'No active cost categories are available.')}</p>}
      <button className="button button--secondary" type="button" disabled={saving || editor.rows.length >= MAX_CONTRACT_ALLOCATIONS || !categories.some(category => category.active === true)} onClick={() => { setEditor(previous => ({ ...previous, rows: [...previous.rows, { key: crypto.randomUUID(), categoryId: '', percent: '' }] })); setError('') }}><span aria-hidden="true">＋ </span>{text('Zuordnung hinzufügen', 'Add allocation')}</button>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><button className="button button--secondary" type="button" disabled={saving} onClick={cancel}>{text('Abbrechen', 'Cancel')}</button><button className="button" type="submit" disabled={saving || !dirty}>{saving ? text('Wird gespeichert …', 'Saving …') : text('Speichern', 'Save')}</button></div>
    </form> : !current.length ? <p className="todo-updates__empty">{text('Noch keine Kostenzuordnung hinterlegt.', 'No cost allocation has been saved.')}</p> : <dl className="contract-details">{current.map((allocation, index) => <div key={`${allocation.categoryId}-${index}`}><dt>{categoryLabel(allocation.categoryId)}</dt><dd>{Number.isInteger(allocation.basisPoints) ? formatPercent(allocation.basisPoints) : text('Anteil nicht verfügbar', 'Percentage unavailable')}</dd></div>)}</dl>}
    <ConfirmDialog open={confirmClose} title={text('Eingaben verwerfen?', 'Discard input?')} message={text('Die ungespeicherte Kostenzuordnung geht verloren.', 'The unsaved cost allocation will be lost.')} cancelLabel={text('Weiter bearbeiten', 'Continue editing')} confirmLabel={text('Verwerfen', 'Discard')} onCancel={() => setConfirmClose(false)} onConfirm={() => { setConfirmClose(false); setEditor(null); setError('') }} />
  </section>
}
