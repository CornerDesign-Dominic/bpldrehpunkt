import { mergeDecisionSummary, mergeValueText, mergeValueWarning } from '../../lib/partnerMergeDecisions.js'

function partnerNumbers(partner, primaryKey, referenceKey) {
  return [...new Set([partner[primaryKey], ...(partner.dycosReferences?.[referenceKey] || [])].map((value) => String(value || '').trim()).filter(Boolean))].join(', ') || '—'
}

function partnerAddress(partner) {
  const address = partner.address || {}
  return [[address.street, address.houseNumber].filter(Boolean).join(' '), [address.postalCode, address.city].filter(Boolean).join(' '), address.country].filter(Boolean).join(', ') || '—'
}

function MergePartnerChoices({ merge, selectedId, onSelect, locked }) {
  return <div className="customer-import-merge">
    <p>{locked ? 'Die Richtung ist durch die gewählte Aktion festgelegt. Das Quellblatt wird archiviert; das Zielblatt bleibt erhalten.' : 'Die Nummern liegen auf zwei Stammdatenblättern. Wähle aus, welches erhalten bleiben soll; das andere wird als zusammengeführt markiert.'}</p>
    <fieldset className="customer-import-merge__fieldset">
      <legend>{locked ? 'Zielpartner festgelegt' : 'Zielpartner wählen'}</legend>
      <div className="customer-import-merge__options">{(merge?.partners || []).map((partner) => {
        const selected = selectedId === partner.id
        const matchedBy = merge.currentPartnerId ? partner.id === merge.currentPartnerId ? 'Aktuell geöffnetes Stammdatenblatt' : 'Ausgewähltes Stammdatenblatt' : partner.id === merge.debtorPartnerId ? 'Treffer über Debitorennummer' : 'Treffer über Kreditorennummer'
        return <label className={`customer-import-merge__option${selected ? ' customer-import-merge__option--selected' : ''}${locked ? ' customer-import-merge__option--locked' : ''}`} key={partner.id}>
          <span className="customer-import-merge__option-heading"><input type="radio" name="merge-target" checked={selected} disabled={locked} onChange={() => onSelect(partner.id)} /><span><strong>{partner.companyName || 'Ohne Firmennamen'}</strong><small>{selected ? 'Dieses Stammdatenblatt bleibt erhalten' : 'Wird mit dem Zielpartner zusammengeführt'}</small></span></span>
          <span className="customer-import-merge__match">{matchedBy}</span>
          <dl>
            <div><dt>Debitorennummern</dt><dd>{partnerNumbers(partner, 'debtorNumber', 'debtorNumbers')}</dd></div>
            <div><dt>Kreditorennummern</dt><dd>{partnerNumbers(partner, 'creditorNumber', 'creditorNumbers')}</dd></div>
            <div><dt>Adresse</dt><dd>{partnerAddress(partner)}</dd></div>
            <div><dt>Standard-E-Mail</dt><dd>{partner.contact?.email || '—'}</dd></div>
          </dl>
          <span className="customer-import-merge__id">Firestore-ID: {partner.id}</span>
        </label>
      })}</div>
    </fieldset>
  </div>
}

function MergeComparisonTable({ rows, decisions, onChange }) {
  const summary = mergeDecisionSummary(rows, decisions)
  return <section className="customer-import-merge-comparison" aria-labelledby="partner-merge-comparison-title">
    <div className="customer-import-merge-comparison__heading"><h3 id="partner-merge-comparison-title">Werte vergleichen und übernehmen</h3><p>{summary.additions} Werte werden ergänzt, {summary.open} Entscheidungen offen.</p></div>
    {!rows.length ? <p className="customer-import-merge-comparison__empty">Keine abweichenden Stammdatenwerte. Die Debitoren- und Kreditorennummern werden unabhängig davon zusammengeführt.</p> : <div className="customer-import-merge-comparison__scroll"><table>
      <thead><tr><th scope="col">Wird archiviert</th><th scope="col">Im Zielpartner</th><th scope="col">Übernahme in Zielpartner</th></tr></thead>
      <tbody>{rows.map((row) => {
        const decision = decisions[row.key]
        const warning = mergeValueWarning(row, decision?.value)
        return <tr key={row.key}>
          <td><strong>{row.label}</strong><span>{mergeValueText(row.sourceValue) || '—'}</span>{row.kind === 'conflict' && <button className="customer-import-merge-comparison__take" type="button" aria-label={`${row.label}: Wert aus dem archivierten Partner übernehmen`} aria-pressed={decision?.resolution === 'source'} onClick={() => onChange(row.key, { value: mergeValueText(row.sourceValue), resolution: 'source' })}>Diesen Wert übernehmen</button>}</td>
          <td><strong>{row.label}</strong><span>{mergeValueText(row.targetValue) || '—'}</span>{row.kind === 'conflict' && <button className="customer-import-merge-comparison__take" type="button" aria-label={`${row.label}: bisherigen Wert des Zielpartners behalten`} aria-pressed={decision?.resolution === 'target'} onClick={() => onChange(row.key, { value: mergeValueText(row.targetValue), resolution: 'target' })}>Diesen Wert behalten</button>}</td>
          <td><label className="sr-only" htmlFor={`merge-result-${row.key}`}>Ergebnis für {row.label}</label><input id={`merge-result-${row.key}`} value={decision?.value ?? ''} onChange={(event) => onChange(row.key, { value: event.target.value, resolution: 'manual' })} /><span className={`customer-import-merge-comparison__status customer-import-merge-comparison__status--${row.kind === 'addition' ? 'addition' : decision?.resolution ? 'resolved' : 'conflict'}`}>{row.kind === 'addition' ? 'wird ergänzt' : decision?.resolution ? 'Entscheidung getroffen' : 'Entscheidung nötig'}</span>
            {warning && <small className="customer-import-merge-comparison__warning">{warning}</small>}
          </td>
        </tr>
      })}</tbody>
    </table></div>}
    <p className="customer-import-merge-comparison__note">Nicht übernommene Quellwerte bleiben im archivierten Stammdatenblatt erhalten. Debitoren- und Kreditorennummern beider Partner werden immer zusammengeführt.</p>
  </section>
}

export default function PartnerMergeReview({ merge, selectedId, onSelect, comparison, onDecision, locked = false }) {
  return <><MergePartnerChoices merge={merge} selectedId={selectedId} onSelect={onSelect} locked={locked} /><MergeComparisonTable rows={comparison.rows} decisions={comparison.decisions} onChange={onDecision} /></>
}
