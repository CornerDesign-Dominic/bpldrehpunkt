import { StaticText, TranslatedProps } from '../../i18n/AutoTranslate.jsx'
import { useId, useRef, useState } from 'react'
import { usePermissions } from '../../auth/usePermissions.js'
import { resolveDycosPartnerConflicts } from '../../lib/dycosMasterData.js'
import { dycosConflictRows } from '../../../shared/dycosPartnerConflicts.js'

const shown = (value) => value === null || value === undefined || value === '' ? '—' : String(value)
const displayValue = (value) => typeof value === 'boolean' ? <StaticText source={value ? 'Ja' : 'Nein'} /> : shown(value)

export default function DycosPartnerDataNotice({ partner, partnerId, dirty = false, onResolved, onBusyChange }) {
  const { canEdit } = usePermissions()
  const [expanded, setExpanded] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState('')
  const submitting = useRef(false), tableId = useId()
  const conflicts = dycosConflictRows(partner)
  const sourceConflict = conflicts.some(row => !row.resolvable && !row.path.startsWith('contacts.'))
  const legacyContactConflict = conflicts.some(row => !row.resolvable && row.path.startsWith('contacts.'))
  const editable = canEdit('masterData') && !partner?.mergedIntoPartnerId && partner?.status !== 'merged'
  async function decide(entry, decision) {
    if (submitting.current || dirty || !editable) return
    submitting.current = true; setPending(true); setError(''); onBusyChange?.(true)
    try {
      await resolveDycosPartnerConflicts({ partnerId: partnerId || partner.id, decision, expectedRows: [entry] })
      await onResolved?.(decision)
    } catch (caught) {
      setError(caught?.code === 'functions/aborted' ? 'Der Vergleich wurde inzwischen geändert. Bitte die Seite neu laden und erneut prüfen.'
        : caught?.code === 'functions/permission-denied' ? 'Keine Berechtigung zur Bearbeitung von Stammdaten.'
          : caught?.code === 'functions/failed-precondition' ? 'Diese Abweichung kann nicht automatisch übernommen werden. Bitte die Angaben manuell prüfen.'
            : 'Die Stammdatenentscheidung konnte nicht gespeichert werden. Bitte erneut versuchen.')
    } finally { submitting.current = false; setPending(false); onBusyChange?.(false) }
  }
  if (!conflicts.length) return null
  return <TranslatedProps sources={{ 'aria-label': 'Abweichende DyCoS-Stammdaten' }}><aside className="partner-import-warning" aria-busy={pending}>
    <div className="partner-import-warning__heading">
      <strong><StaticText source="Abweichende DyCoS-Stammdaten" /></strong>
      <div className="partner-import-warning__actions">
        <button type="button" className="button button--secondary" aria-expanded={expanded} aria-controls={tableId} onClick={() => setExpanded(value => !value)}><StaticText source={expanded ? 'Abweichungen ausblenden' : 'Abweichungen anzeigen'} /></button>
      </div>
    </div>
    <p><StaticText source="Vorhandene Werte wurden beibehalten. Entscheide je Feld, ob du den DyCoS-Wert übernehmen oder die Abweichung verwerfen möchtest." /></p>
    {editable && dirty && <p role="status"><StaticText source="Bitte zuerst die offenen Änderungen speichern oder verwerfen." /></p>}
    {sourceConflict && <p><StaticText source="Kunden- und Unternehmerdaten widersprechen sich in einzelnen Feldern. Bitte diese Angaben prüfen." /></p>}
    {editable && legacyContactConflict && <p><StaticText source="Einzelne Ansprechpartnerangaben benötigen einen erneuten DyCoS-Abruf oder eine manuelle Prüfung." /></p>}
    {pending && <p role="status"><StaticText source="Entscheidung wird gespeichert …" /></p>}
    {error && <p className="form-error" role="alert"><StaticText source={error} /></p>}
    <div id={tableId} hidden={!expanded} className="table-frame"><table className="data-table"><thead><tr><th><StaticText source="Feld" /></th><th>Drehpunkt</th><th>DyCoS</th>{editable && <th><StaticText source="Aktion" /></th>}</tr></thead><tbody>{conflicts.map((entry, index) => <tr key={`${entry.path}-${index}`}><td><StaticText source={entry.label} /></td><td>{displayValue(entry.currentValue)}</td><td>{displayValue(entry.incomingValue)}</td>{editable && <td><div className="partner-import-warning__actions"><button type="button" className="button" disabled={pending || dirty || !entry.resolvable} onClick={() => void decide(entry, 'accept')}><StaticText source="Übernehmen" /></button><button type="button" className="button button--secondary" disabled={pending || dirty} onClick={() => void decide(entry, 'keep')}><StaticText source="Verwerfen" /></button></div></td>}</tr>)}</tbody></table></div>
  </aside></TranslatedProps>
}
