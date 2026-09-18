function formatCurrency(value) { return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value || 0) }

export default function InkassoInvoicesCard({ canEdit, invoices, inkassoCase, loading, onPaymentChange, savingInvoiceId }) {
  const columns = 5
  const paidAmount = Number(inkassoCase.paidAmount || 0)
  const claimAmount = Number(inkassoCase.claimAmount || 0)

  return <section className="todo-detail-content damage-financial-overview inkasso-invoices-card" aria-labelledby="inkasso-invoices-title">
    <div className="todo-detail-section-heading"><h3 id="inkasso-invoices-title">Rechnungen</h3><span>{invoices.length}</span></div>
    <div className="inkasso-financial-overview__summary"><div><span>Offene Forderung</span><strong>{formatCurrency(claimAmount)}</strong></div><div><span>Bereits bezahlt</span><strong>{formatCurrency(paidAmount)}</strong></div></div>
    <div className="damage-cases-table-frame"><table className="data-table todos-table"><thead><tr><th>Rechnungsnummer</th><th>Netto</th><th>USt.</th><th>Gesamt</th><th>Bezahlt</th></tr></thead><tbody>
      {loading ? <tr><td className="table-state" colSpan={columns}>Rechnungen werden geladen …</td></tr> : !invoices.length ? <tr><td className="table-state" colSpan={columns}>Keine Rechnungen hinterlegt.</td></tr> : invoices.map((invoice) => <tr key={invoice.id}><td className="todos-table__title">{invoice.invoiceNumber}</td><td>{formatCurrency(invoice.netAmount)}</td><td>{formatCurrency(invoice.vatAmount)}</td><td>{formatCurrency(invoice.grossAmount)}</td><td><label className="damage-filter-toggle"><input type="checkbox" checked={invoice.isPaid === true} disabled={!canEdit || Boolean(savingInvoiceId)} onChange={(event) => onPaymentChange(invoice, event.target.checked)} />Bezahlt</label></td></tr>)}
    </tbody></table></div>
  </section>
}
