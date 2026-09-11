function formatCurrency(value) {
  return value === null || value === undefined || value === '' ? '—' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(value))
}

const fields = [
  ['Ursprüngliche Forderung', 'originalClaim'],
  ['Gegenforderung', 'counterClaim'],
  ['Streitwert', 'amountInDispute'],
  ['Bereits gezahlt', 'paidAmount'],
  ['Noch offen', 'openAmount'],
  ['Rechtsanwaltskosten', 'legalFees'],
  ['Gerichtskosten', 'courtCosts'],
  ['Sonstige Kosten', 'otherCosts'],
]

export default function LegalDisputeFinancialOverview({ canEdit, legalDispute, onEdit }) {
  return <section className="todo-detail-content damage-financial-overview" aria-labelledby="legal-dispute-financial-overview-title">
    <div className="todo-detail-section-heading"><h3 id="legal-dispute-financial-overview-title">Finanzieller Überblick</h3>{canEdit && <button className="button button--secondary damage-financial-overview__add" type="button" onClick={onEdit}>Bearbeiten</button>}</div>
    <div className="legal-dispute-financial-overview__metrics">{fields.map(([label, field]) => <div key={field}><span>{label}</span><strong>{formatCurrency(legalDispute[field])}</strong></div>)}</div>
  </section>
}
