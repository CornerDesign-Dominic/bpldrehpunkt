import { formatPalletDate, formatPalletNumber } from './palletFormatters.js'
import { EditIcon } from '../icons.jsx'

export default function PalletJournal({ account, accountError, isEntryFormActive, onAddClosing, onAddMovement, onEditMovement }) {
  return <section className="pallet-journal">
    <div className="pallet-journal__header"><h3>Kontoliste</h3><div className="pallet-journal__actions"><button className="button" type="button" onClick={onAddMovement} disabled={isEntryFormActive}>Bewegung hinzufügen</button><button className="button button--secondary" type="button" onClick={onAddClosing} disabled={isEntryFormActive}>Abschluss hinzufügen</button></div></div>
    <div className="table-frame"><table><thead><tr><th>Datum</th><th>Art</th><th>Tournummer</th><th>Lade-Zug.</th><th>Lade-Abg.</th><th>Entl.-Zug.</th><th>Entl.-Abg.</th><th>Veränderung</th><th>Palettenschein</th><th><span className="sr-only">Aktion</span></th></tr></thead><tbody>
      {accountError ? <tr><td colSpan="10" className="table-state">Keine Palettenbuchungen verfügbar.</td></tr> : account.entries.length ? account.entries.map((entry) => {
        const isMovement = entry.entryType === 'movement'
        return <tr className={entry.entryType === 'closing' ? 'pallet-journal__closing' : ''} key={`${entry.entryType}-${entry.id}`}>
          <td>{formatPalletDate(entry.date)}</td>
          <td><span className={`pallet-entry-badge pallet-entry-badge--${isMovement ? 'movement' : 'closing'}`}>{isMovement ? 'Bewegung' : 'Abschluss'}</span></td>
          <td>{isMovement ? <strong className="pallet-tour">{entry.tourNumber || '—'}</strong> : '—'}</td>
          <td className="pallet-quantity">{isMovement && entry.loadingPoint ? formatPalletNumber(entry.loadingPoint.received) : '—'}</td>
          <td className="pallet-quantity">{isMovement && entry.loadingPoint ? formatPalletNumber(entry.loadingPoint.delivered) : '—'}</td>
          <td className="pallet-quantity">{isMovement && entry.unloadingPoint ? formatPalletNumber(entry.unloadingPoint.received) : '—'}</td>
          <td className="pallet-quantity">{isMovement && entry.unloadingPoint ? formatPalletNumber(entry.unloadingPoint.delivered) : '—'}</td>
          <td className="pallet-quantity"><strong>{formatPalletNumber(entry.change, true)}</strong></td>
          <td>{isMovement ? entry.palletReceiptNumber || '—' : '—'}</td>
          <td className="pallet-journal__action">{isMovement && <button type="button" onClick={() => onEditMovement(entry)} disabled={isEntryFormActive} title="Bearbeiten" aria-label="Palettenbewegung bearbeiten"><EditIcon /></button>}</td>
        </tr>
      }) : <tr><td colSpan="10" className="table-state">Noch keine Palettenbuchungen vorhanden.</td></tr>}
    </tbody></table></div>
  </section>
}
