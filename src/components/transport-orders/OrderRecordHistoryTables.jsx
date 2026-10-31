import { StaticText } from '../../i18n/AutoTranslate.jsx'
import { useLanguage } from '../../i18n/useLanguage.js'
import { orderRecordHistoryRows, orderRecordHistoryTime, trackingRecordHistoryRows } from '../../lib/orderRecordHistoryRows.js'
import { recordHistoryActor } from '../../lib/recordHistoryPresentation.js'
import { transportOrderHistoryValue } from '../../lib/transportOrderHistoryPresentation.js'
import { shipmentTrackingEventChangeType, shipmentTrackingEventDescription, shipmentTrackingSourceLabel } from '../../lib/shipmentTrackingPresentation.js'

function TranslatedLabel({ value }) {
  return String(value || '—').split(' · ').map((part, index) => <span key={index}>{index ? ' · ' : ''}<StaticText source={part} /></span>)
}

function HistoryStateRows({ columns, error, loading, empty, errorLabel, emptyLabel, w }) {
  return <>
    {error && <tr><td colSpan={columns} className="table-state form-error" role="alert">{errorLabel}</td></tr>}
    {loading && <tr><td colSpan={columns} className="table-state" role="status">{w('Historie wird geladen …', 'Loading history …')}</td></tr>}
    {!error && !loading && empty && <tr><td colSpan={columns} className="table-state">{emptyLabel}</td></tr>}
  </>
}

export default function OrderRecordHistoryTables({ order, history = {}, refreshes = [], historyError, historyLoading, onRetry, onMore, tracking = {}, onTrackingRetry, onTrackingMore, focusedRefreshId }) {
  const { language } = useLanguage()
  const w = (de, en) => language === 'en' ? en : de
  const locale = language === 'en' ? 'en-GB' : 'de-DE'
  const orderRows = orderRecordHistoryRows(order, history.changes || [], refreshes)
  const trackingRows = trackingRecordHistoryRows(tracking.events || [])
  const date = (value) => {
    const time = orderRecordHistoryTime(value)
    return time ? new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(time)) : '—'
  }
  const statusLabel = (value) => ({ success: w('Aktualisiert', 'Updated'), partial: w('Teilweise aktualisiert', 'Partially updated'), failed: w('Aktualisierung fehlgeschlagen', 'Update failed'), running: w('Aktualisierung läuft', 'Update in progress'), unconfirmed: w('Aktualisierung nicht bestätigt', 'Update not confirmed') })[value] || w('Prüfung erforderlich', 'Review required')
  const stepStatus = (value) => ({ updated: w('Aktualisiert', 'Updated'), unchanged: w('Unverändert', 'Unchanged'), new: w('Neu angelegt', 'Created'), failed: w('Fehlgeschlagen', 'Failed'), skipped: w('Nicht abgerufen', 'Not retrieved') })[value] || w('Prüfung erforderlich', 'Review required')
  const codeLabel = (value) => ({ interrupted: w('Abruf unterbrochen; der Ausgang einzelner Schritte ist ungewiss. Bereits gespeicherte Änderungen bleiben erhalten.', 'Update interrupted; some step results are uncertain. Changes already saved remain intact.'), 'no-linked-partners': w('Keine Geschäftspartner mit dem Auftrag verknüpft.', 'No business partners linked to this order.'), 'permission-denied': w('Für diesen Teil fehlt die Berechtigung.', 'Permission is missing for this step.') })[value] || w('Dieser Teil konnte nicht zuverlässig abgeschlossen werden.', 'This step could not be reliably completed.')
  const scopeLabel = (value) => ({ all: w('Auftrag und Stammdaten', 'Order and master data'), order: w('Auftragsdaten', 'Order data'), partners: w('Geschäftspartner', 'Business partners') })[value] || w('Nicht protokolliert', 'Not recorded')
  function RefreshResult({ entry }) {
    const result = entry.result || {}
    return <>
      <p>{statusLabel(entry.status)}</p>
      {entry.status === 'unconfirmed' && <p>{w('Das Ergebnis des Abrufs konnte nicht bestätigt werden. Bitte erneut aktualisieren. Bereits gespeicherte Änderungen bleiben erhalten.', 'The result could not be confirmed. Please update again. Changes already saved remain intact.')}</p>}
      {result.code && <p>{codeLabel(result.code)}</p>}
      {result.order && <p>{w('Auftragsdaten', 'Order data')}: {stepStatus(result.order.status)}{result.order.code && <> · {codeLabel(result.order.code)}</>}{result.order.conflicts > 0 && <> · {w('Abweichende Stammdaten prüfen', 'Review differing master data')} ({result.order.conflicts})</>}</p>}
      {result.partners?.map((partner, index) => <p key={index}>{w('Geschäftspartner', 'Business partner')}: {stepStatus(partner.status)}{partner.code && <> · {codeLabel(partner.code)}</>}{partner.conflicts > 0 && <> · {w('Abweichende Stammdaten prüfen', 'Review differing master data')} ({partner.conflicts})</>}</p>)}
    </>
  }
  return <div className="order-record-history-tables">
    <section aria-labelledby="order-record-history-heading">
      <h3 id="order-record-history-heading">{w('Auftragshistorie', 'Order history')}</h3>
      <div className="order-workspace__scroll"><table className="data-table order-record-history-table" aria-labelledby="order-record-history-heading" aria-busy={Boolean(historyLoading)}>
        <thead><tr>{[w('Zeitpunkt', 'Time'), w('Benutzer', 'User'), w('Aktion', 'Action'), w('Feld', 'Field'), w('Alte Daten', 'Previous data'), w('Neue Daten / Ergebnis', 'New data / result')].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>
          <HistoryStateRows columns={6} error={historyError} loading={historyLoading} empty={!orderRows.length} errorLabel={w('Die Auftragshistorie konnte nicht geladen werden.', 'The order history could not be loaded.')} emptyLabel={w('Noch keine Einträge vorhanden.', 'No entries yet.')} w={w} />
          {orderRows.map((row) => {
            const entry = row.entry
            const actor = row.type === 'refresh' ? entry.actorName || entry.actorId || recordHistoryActor(entry) : recordHistoryActor(entry)
            return <tr key={row.id} id={row.type === 'refresh' && entry.id ? `order-refresh-${entry.id}` : undefined} data-focused={row.type === 'refresh' && entry.id === focusedRefreshId}>
              <td><time>{date(row.timestamp)}</time>{row.type === 'refresh' && entry.startedAt && entry.completedAt && orderRecordHistoryTime(entry.startedAt) !== orderRecordHistoryTime(entry.completedAt) && <div className="order-workspace__muted">{w('Beginn', 'Started')}: {date(entry.startedAt)}</div>}</td>
              <td>{actor === 'Nicht protokolliert' ? w('Nicht protokolliert', 'Not recorded') : actor}</td>
              <td>{row.type === 'refresh' ? statusLabel(entry.status) : row.type === 'creation' ? w('Auftrag angelegt', 'Order created') : row.type === 'change' ? w('Daten geändert', 'Data changed') : <StaticText source={entry.summary || 'Daten geändert'} />}</td>
              <td>{row.type === 'change' ? <TranslatedLabel value={row.change.label} /> : row.type === 'refresh' ? scopeLabel(entry.scope) : '—'}</td>
              <td>{row.type === 'change' ? typeof row.change.oldValue === 'boolean' ? <StaticText source={transportOrderHistoryValue(row.change.oldValue, language, row.change)} /> : transportOrderHistoryValue(row.change.oldValue, language, row.change) : '—'}</td>
              <td>{row.type === 'refresh' ? <RefreshResult entry={entry} /> : row.type === 'change' ? typeof row.change.newValue === 'boolean' ? <StaticText source={transportOrderHistoryValue(row.change.newValue, language, row.change)} /> : transportOrderHistoryValue(row.change.newValue, language, row.change) : row.type === 'legacy' ? w('Weitere Feldangaben nicht protokolliert.', 'Further field details were not recorded.') : w('Auftrag angelegt', 'Order created')}</td>
            </tr>
          })}
        </tbody>
      </table></div>
      {(historyError || history.hasMore || history.refreshHasMore) && <div className="order-record-history-actions">{historyError && <button className="button button--secondary" type="button" disabled={historyLoading} onClick={onRetry}>{w('Erneut versuchen', 'Try again')}</button>}{(history.hasMore || history.refreshHasMore) && <button className="button button--secondary" type="button" disabled={historyLoading} onClick={onMore}>{w('Weitere Auftragshistorie laden', 'Load more order history')}</button>}</div>}
    </section>
    <section aria-labelledby="order-tracking-history-heading">
      <h3 id="order-tracking-history-heading">{w('Sendungsverfolgungshistorie', 'Shipment tracking history')}</h3>
      <div className="order-workspace__scroll"><table className="data-table order-record-history-table" aria-labelledby="order-tracking-history-heading" aria-busy={Boolean(tracking.loading)}>
        <thead><tr>{[w('Ereigniszeit', 'Event time'), w('Erfasst am', 'Recorded at'), w('Benutzer', 'User'), w('Aktion', 'Action'), w('Ereignis', 'Event'), w('Quelle', 'Source')].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>
          <HistoryStateRows columns={6} error={tracking.error} loading={tracking.loading} empty={!trackingRows.length} errorLabel={w('Die Sendungsverfolgungshistorie konnte nicht geladen werden.', 'The shipment tracking history could not be loaded.')} emptyLabel={w('Noch keine Ereignisse vorhanden.', 'No events yet.')} w={w} />
          {trackingRows.map(({ id, entry, timestamp, recordedAt }) => <tr key={id}>
            <td><time>{date(timestamp)}</time></td><td><time>{date(recordedAt)}</time></td>
            <td>{entry.recordedByName || entry.recordedBy || entry.actorName || w('Nicht protokolliert', 'Not recorded')}</td>
            <td><StaticText source={shipmentTrackingEventChangeType(entry)} /></td>
            <td><StaticText source={shipmentTrackingEventDescription(entry)} />{entry.note && <p>{entry.note}</p>}</td>
            <td><StaticText source={shipmentTrackingSourceLabel(entry)} /></td>
          </tr>)}
        </tbody>
      </table></div>
      {(tracking.error || tracking.hasMore) && <div className="order-record-history-actions">{tracking.error && <button className="button button--secondary" type="button" disabled={tracking.loading} onClick={onTrackingRetry}>{w('Erneut versuchen', 'Try again')}</button>}{tracking.hasMore && <button className="button button--secondary" type="button" disabled={tracking.loading} onClick={onTrackingMore}>{w('Weitere Sendungsverfolgungshistorie laden', 'Load more tracking history')}</button>}</div>}
    </section>
  </div>
}
