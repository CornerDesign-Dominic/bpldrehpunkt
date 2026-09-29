import { formatPalletDate, formatPalletNumber } from './palletFormatters.js'
import { PALLET_TYPES } from '../../constants/pallets.js'

export default function PalletJournal({ account, accountError, isEntryFormActive, onAddClosing, onAddMovement, onEditClosing, onEditMovement, canEdit }) {
  return <section className="pallet-journal">
    <div className="pallet-journal__header"><h3>Kontoliste</h3>{canEdit && <div className="pallet-journal__actions"><button className="button" type="button" onClick={onAddMovement} disabled={isEntryFormActive}>Bewegung hinzufügen</button><button className="button button--secondary" type="button" onClick={onAddClosing} disabled={isEntryFormActive}>Abschluss hinzufügen</button></div>}</div>
    <div className="table-frame"><table className="data-table"><thead><tr><th>Datum</th><th>Art</th><th>Tournummer</th><th>Palettentyp</th><th>Lade-Zug.</th><th>Lade-Abg.</th><th>Entl.-Zug.</th><th>Entl.-Abg.</th><th>Veränderung</th><th>Palettenschein</th></tr></thead><tbody>
      {accountError ? <tr><td colSpan="10" className="table-state">Keine Palettenbuchungen verfügbar.</td></tr> : account.entries.length ? account.entries.map((entry) => {
        const isMovement = entry.entryType === 'movement'
        const editable = canEdit && !isEntryFormActive
        const edit = () => isMovement ? onEditMovement(entry) : onEditClosing(entry)
        return <tr className={`${entry.entryType === 'closing' ? 'pallet-journal__closing' : ''}${editable ? ' pallet-journal__row--interactive' : ''}`} key={`${entry.entryType}-${entry.id}`} tabIndex={editable ? 0 : undefined} aria-label={editable ? `${isMovement ? 'Palettenbewegung' : 'Kontoabschluss'} vom ${formatPalletDate(entry.date)} bearbeiten` : undefined} onClick={editable ? edit : undefined} onKeyDown={editable ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); edit() } } : undefined}>
          <td>{formatPalletDate(entry.date)}</td>
          <td><span className={`pallet-entry-badge pallet-entry-badge--${isMovement ? 'movement' : 'closing'}`}>{isMovement ? 'Bewegung' : 'Abschluss'}</span></td>
          <td>{isMovement ? <strong className="pallet-tour">{entry.tourNumber || '—'}</strong> : '—'}</td>
          <td>{isMovement ? PALLET_TYPES.includes(entry.palletType) ? entry.palletType : PALLET_TYPES[0] : '—'}</td>
          <td className="pallet-quantity">{isMovement && entry.loadingPoint ? formatPalletNumber(entry.loadingPoint.received) : '—'}</td>
          <td className="pallet-quantity">{isMovement && entry.loadingPoint ? formatPalletNumber(entry.loadingPoint.delivered) : '—'}</td>
          <td className="pallet-quantity">{isMovement && entry.unloadingPoint ? formatPalletNumber(entry.unloadingPoint.received) : '—'}</td>
          <td className="pallet-quantity">{isMovement && entry.unloadingPoint ? formatPalletNumber(entry.unloadingPoint.delivered) : '—'}</td>
          <td className="pallet-quantity"><strong>{formatPalletNumber(entry.change, true)}{entry.entryType === 'closing' ? ' Paletten' : ''}</strong></td>
          <td>{isMovement ? entry.palletReceiptNumber || '—' : '—'}</td>
        </tr>
      }) : <tr><td colSpan="10" className="table-state">Noch keine Palettenbuchungen vorhanden.</td></tr>}
    </tbody></table></div>
  </section>
}
