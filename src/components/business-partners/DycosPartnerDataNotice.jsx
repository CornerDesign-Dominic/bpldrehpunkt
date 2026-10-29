import { StaticText, TranslatedProps } from '../../i18n/AutoTranslate.jsx'

const shown = (value) => value === null || value === undefined || value === '' ? '—' : String(value)
const at = (data, path) => path.split('.').reduce((value, key) => value?.[key], data)
const displayValue = (value) => typeof value === 'boolean' ? <StaticText source={value ? 'Ja' : 'Nein'} /> : shown(value)

export default function DycosPartnerDataNotice({ partner }) {
  const imported = partner?.dycosImport
  if (!imported) return null
  const conflicts = (imported.conflicts || []).filter((entry) => shown(at(partner, entry.path)) !== shown(entry.incomingValue))
  return <>
    {conflicts.length > 0 && <TranslatedProps sources={{ 'aria-label': 'Abweichende DyCoS-Stammdaten' }}><aside className="partner-import-warning" aria-label="Abweichende DyCoS-Stammdaten">
      <strong><StaticText source="Abweichende DyCoS-Stammdaten" /></strong>
      <p><StaticText source="Vorhandene Werte wurden beibehalten. Prüfe die Abweichungen und bearbeite die Stammdaten bei Bedarf. Ein erneuter TA-Abruf aktualisiert den Vergleich." /></p>
      <div className="table-frame"><table className="data-table"><thead><tr><th><StaticText source="Feld" /></th><th>Drehpunkt</th><th>DyCoS</th></tr></thead><tbody>{conflicts.map((entry, index) => <tr key={`${entry.path}-${index}`}><td><StaticText source={entry.label} /></td><td>{displayValue(at(partner, entry.path))}</td><td>{displayValue(entry.incomingValue)}</td></tr>)}</tbody></table></div>
    </aside></TranslatedProps>}

  </>
}
