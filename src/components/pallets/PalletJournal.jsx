import { formatPalletDate, formatPalletNumber } from './palletFormatters.js'

export default function PalletJournal({ account, accountError, onEditMovement, partnersById }) {
  return <section className="pallet-journal">
    <div className="pallet-journal__header"><h3>Kontoliste</h3><span>{account.entries.length} Buchungen</span></div>
    <div className="table-frame"><table><thead><tr><th>Datum</th><th>Tour / Referenz</th><th>Gegenpartner</th><th><span className="table-header-stack"><span>Ladestelle</span><span>erhalten</span></span></th><th><span className="table-header-stack"><span>Ladestelle</span><span>abgegeben</span></span></th><th><span className="table-header-stack"><span>Entladestelle</span><span>erhalten</span></span></th><th><span className="table-header-stack"><span>Entladestelle</span><span>abgegeben</span></span></th><th>Veränderung</th><th>Kontostand</th><th>Palettenschein</th><th><span className="sr-only">Aktion</span></th></tr></thead><tbody>
      {accountError ? <tr><td colSpan="11" className="table-state">Keine Palettenbuchungen verfügbar.</td></tr> : account.entries.length ? account.entries.map((entry) => {
        const counterparty = partnersById.get(entry.counterpartyId)
        const isMovement = entry.entryType === 'movement'
        return <tr className={entry.entryType === 'closing' ? 'pallet-journal__closing' : ''} key={`${entry.entryType}-${entry.id}`}>
          <td>{formatPalletDate(entry.date)}</td>
          <td>{isMovement ? <span className="pallet-movement-reference"><strong className="pallet-tour">{entry.tourNumber || '—'}</strong>{entry.editHistory?.length > 0 && <span className="pallet-edited-badge">bearbeitet</span>}</span> : <span className="pallet-closing-reference"><span className="pallet-entry-badge pallet-entry-badge--closing">Abschluss</span>{entry.reference || '—'}</span>}</td>
          <td>{isMovement ? counterparty?.companyName || '—' : '—'}</td>
          <td className="pallet-quantity">{isMovement && entry.loadingPoint ? formatPalletNumber(entry.loadingPoint.received) : '—'}</td>
          <td className="pallet-quantity">{isMovement && entry.loadingPoint ? formatPalletNumber(entry.loadingPoint.delivered) : '—'}</td>
          <td className="pallet-quantity">{isMovement && entry.unloadingPoint ? formatPalletNumber(entry.unloadingPoint.received) : '—'}</td>
          <td className="pallet-quantity">{isMovement && entry.unloadingPoint ? formatPalletNumber(entry.unloadingPoint.delivered) : '—'}</td>
          <td className="pallet-quantity"><strong>{formatPalletNumber(entry.change, true)}</strong></td>
          <td className="pallet-quantity"><strong>{formatPalletNumber(entry.balance, true)}</strong></td>
          <td>{isMovement ? entry.palletReceiptNumber || '—' : '—'}</td>
          <td className="pallet-journal__action">{isMovement && <button type="button" onClick={() => onEditMovement(entry)}>Bearbeiten</button>}</td>
        </tr>
      }) : <tr><td colSpan="11" className="table-state">Noch keine Palettenbuchungen vorhanden.</td></tr>}
    </tbody></table></div>
  </section>
}
