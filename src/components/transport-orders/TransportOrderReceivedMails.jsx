import ShipmentTrackingDerivation from './ShipmentTrackingDerivation.jsx'
import { trackingReviewProposals, trackingReviewTransitProposals } from '../../lib/shipmentTrackingDerivation.js'
import { fieldLabels, formatShipmentTrackingTimestamp } from '../../lib/shipmentTrackingPresentation.js'
import { StaticText } from '../../i18n/AutoTranslate.jsx'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions, waitForAppCheckToken } from '../../lib/firebase.js'
import { reportTechnicalFailure } from '../../lib/diagnostics.js'
import { useLanguage } from '../../i18n/useLanguage.js'
import MailWorkDialog from '../mailboxes/MailWorkDialog.jsx'
import ShipmentTrackingMailEditor from './ShipmentTrackingMailEditor.jsx'
import { canRetryStatusMailAi, statusMailAiLeaseExpiresAt } from '../../lib/statusMailAiRetry.js'
import '../../styles/transportOrderReceivedMails.css'

function receivedLabel(value, language) {
  const date = value?.toDate?.()
  return date ? new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(date) : '—'
}

const aiLabels = { pending: 'KI-Auswertung läuft', applied: 'KI-Status übernommen', no_change: 'Keine Statusangabe erkannt', needs_review: 'Statusangabe manuell prüfen', reviewed: 'Manuelle Prüfung abgeschlossen', skipped: 'KI-Auswertung übersprungen', error: 'KI-Auswertung fehlgeschlagen' }

export default function TransportOrderReceivedMails({ open = false, onClose, transportOrderId, tracking, trackingEvents, trackingLoading = false, trackingError = '', onRetryTracking, trackingSaving = false, onSaveTracking, canEdit = false, onMailsChanged }) {
  const { language } = useLanguage()
  const [mails, setMails] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [pageSize, setPageSize] = useState(50)
  const [hasMore, setHasMore] = useState(false)
  const [reload, setReload] = useState(0)
  const [retryingId, setRetryingId] = useState(null)
  const [retryError, setRetryError] = useState('')
  const [resolvingId, setResolvingId] = useState(null)
  const [savedNotice, setSavedNotice] = useState(false)
  const [, refreshLeaseClock] = useState(0)
  const selected = mails.find((mail) => mail.id === selectedId) || mails[0]
  const pendingUpdates = trackingReviewProposals(selected?.ai?.updates)
  const pendingTransitUpdates = trackingReviewTransitProposals(selected?.ai?.transitUpdates)
  const busy = trackingSaving || Boolean(retryingId || resolvingId)
  const selectedLeaseExpiresAt = statusMailAiLeaseExpiresAt(selected)
  const expiredPending = selected?.ai?.status === 'pending' && canRetryStatusMailAi(selected)

  useEffect(() => {
    if (!open || selectedLeaseExpiresAt === null || selectedLeaseExpiresAt <= Date.now()) return
    // One timer while a dialog contains an actual lease. Initial pending mails
    // without a lease never acquire an invented timeout/retry policy.
    const timer = setTimeout(() => refreshLeaseClock((value) => value + 1), Math.min(selectedLeaseExpiresAt - Date.now() + 1, 2_147_483_647))
    return () => clearTimeout(timer)
  }, [open, selectedLeaseExpiresAt])

  async function retryAi(mailId) {
    setRetryingId(mailId)
    setRetryError('')
    try {
      await waitForAppCheckToken()
      const { data } = await httpsCallable(functions, 'retryStatusMailAi', { timeout: 120000 })({ orderId: transportOrderId, mailId })
      if (!['applied', 'no_change', 'needs_review', 'reviewed', 'skipped'].includes(data?.status)) setRetryError('Die KI-Auswertung konnte nicht abgeschlossen werden.')
    } catch (caught) {
      setRetryError('Die KI-Auswertung konnte nicht gestartet werden. Bitte erneut versuchen.')
      void reportTechnicalFailure({ module: 'shipment-tracking', stage: 'save', error: caught, orderId: transportOrderId })
    } finally {
      setRetryingId(null)
    }
  }
  async function resolveReview(mailId) {
    setResolvingId(mailId); setRetryError('')
    try { await waitForAppCheckToken(); await httpsCallable(functions, 'resolveStatusMailReview')({ orderId: transportOrderId, mailId }) } catch (caught) {
      setRetryError('Die manuelle Prüfung konnte nicht abgeschlossen werden.')
      void reportTechnicalFailure({ module: 'shipment-tracking', stage: 'save', error: caught, orderId: transportOrderId })
    } finally { setResolvingId(null) }
  }

  useEffect(() => {
    // Keep older loaded mails live too, including subsequent AI review results.
    const mailsQuery = query(collection(db, 'transportOrders', transportOrderId, 'receivedMails'), orderBy('receivedAt', 'desc'), limit(pageSize + 1))
    return onSnapshot(mailsQuery, (snapshot) => {
      const next = snapshot.docs.slice(0, pageSize).map((entry) => ({ id: entry.id, ...entry.data() }))
      setHasMore(snapshot.docs.length > pageSize)
      setMails(next); onMailsChanged?.(next)
      setLoading(false)
      setError(false)
    }, (caught) => {
      setLoading(false); setError(true)
      void reportTechnicalFailure({ module: 'shipment-tracking', stage: 'load', error: caught, orderId: transportOrderId })
    })
  }, [transportOrderId, onMailsChanged, pageSize, reload])

  const sidebar = <>
    <h3><StaticText source="Zugeordnete Mails" /></h3>
    {loading && <p role="status"><StaticText source="Mails werden geladen …" /></p>}
    {error && <div role="alert"><p className="form-error"><StaticText source="Mails konnten nicht geladen werden." /></p><button className="button button--secondary" type="button" onClick={() => { setLoading(true); setError(false); setReload(value => value + 1) }}><StaticText source="Erneut versuchen" /></button></div>}
    {!loading && !error && mails.length === 0 && <p><StaticText source="Noch keine zugeordneten Mails." /></p>}
    <ol className="transport-order-received-mails__list">{mails.map((mail) => <li key={mail.id}><button aria-current={selected?.id === mail.id ? 'true' : undefined} disabled={busy} className={mail.ai?.reviewRequired || ['needs_review', 'error'].includes(mail.ai?.status) ? 'transport-order-received-mails__needs-review' : ''} type="button" onClick={() => { setSelectedId(mail.id); setSavedNotice(false); setRetryError('') }}><span>{mail.subject || <StaticText source="Ohne Betreff" />}</span><small>{receivedLabel(mail.receivedAt, language)} · {mail.sender}</small>{aiLabels[mail.ai?.status] && <small className={mail.ai.status === 'applied' ? 'transport-order-received-mails__ai' : ''}><StaticText source={aiLabels[mail.ai.status]} /></small>}{mail.ai?.reviewRequired && <small><StaticText source="Manuelle Prüfung nötig" /></small>}</button></li>)}</ol>
    {hasMore && <button className="button button--secondary" type="button" disabled={loading || busy} onClick={() => { setLoading(true); setPageSize(size => size + 50) }}><StaticText source="Ältere Mails laden" /></button>}
  </>

  // The native modal must also be visible from a hidden tracking panel.
  // Keep one tracking draft for the order across mail selection and closing.
  return createPortal(<MailWorkDialog open={open} title={language === 'en' ? 'Assigned emails' : 'Zugeordnete Mails'} className="order-mails-dialog" documentKey={selected?.id} sidebar={sidebar} sidebarLabel={language === 'en' ? 'Assigned emails' : 'Zugeordnete Mails'} defaultSplit={50} splitStorageKey="drehpunkt.orderMailsSplit.v1" busy={busy} onClose={onClose} rightLoading={trackingLoading} loadingLabel={language === 'en' ? 'Loading shipment tracking …' : 'Sendungsverfolgung wird geladen …'} left={selected ? <>
    <header className="order-mails-dialog__message-heading"><h3>{selected.subject || <StaticText source="Ohne Betreff" />}</h3><p>{selected.sender} · {receivedLabel(selected.receivedAt, language)}</p></header>
    {aiLabels[selected.ai?.status] && <p><StaticText source={expiredPending ? 'Die vorherige KI-Auswertung wurde unterbrochen. Du kannst sie erneut starten.' : aiLabels[selected.ai.status]} /></p>}
    {selected.ai?.reviewRequired && <p className="shipment-tracking-recipients__warning">{selected.ai.reviewReason || <StaticText source="Statusangabe bitte manuell prüfen." />}</p>}
    {(pendingUpdates.length > 0 || pendingTransitUpdates.length > 0) && <section className="shipment-tracking-recipients__warning" aria-label={language === 'en' ? 'Inferred suggestions' : 'Abgeleitete Vorschläge'}><strong>{language === 'en' ? 'Inferred suggestions · not applied automatically' : 'Abgeleitete Vorschläge · nicht automatisch übernommen'}</strong>{pendingUpdates.map(update => <div key={update.field}><p><StaticText source={fieldLabels[update.field] || update.field} />: <strong>{formatShipmentTrackingTimestamp(update.value)}</strong></p><ShipmentTrackingDerivation derivation={update.derivation} /></div>)}{pendingTransitUpdates.map((update, index) => <div key={`distance-${index}`}><p>{language === 'en' ? 'Remaining distance to unloading' : 'Restkilometer bis Entladestelle'}: <strong>{new Intl.NumberFormat(language === 'en' ? 'en-GB' : 'de-DE', { maximumFractionDigits: 1 }).format(update.kilometersToDestination)} km</strong></p><ShipmentTrackingDerivation derivation={update.derivation} /></div>)}</section>}
    <pre className="transport-order-received-mail-modal__body">{selected.bodyText || <StaticText source="Kein Textinhalt vorhanden." />}</pre>
    {retryError && <p className="form-error" role="alert"><StaticText source={retryError} /></p>}
    <div className="shipment-tracking-editor__actions">{canEdit && selected.ai?.reviewRequired && <button className="button" type="button" disabled={busy} onClick={() => void resolveReview(selected.id)}><StaticText source={resolvingId === selected.id ? 'Wird abgeschlossen …' : 'Manuelle Prüfung abschließen'} /></button>}{canEdit && canRetryStatusMailAi(selected) && <button className="button button--secondary" type="button" disabled={busy} onClick={() => void retryAi(selected.id)}><StaticText source={retryingId === selected.id ? 'KI wertet aus …' : 'KI erneut auswerten'} /></button>}</div>
  </> : <p><StaticText source={loading ? 'Mails werden geladen …' : error ? 'Mails konnten nicht geladen werden.' : 'Noch keine zugeordneten Mails.'} /></p>}>
    {trackingError && <div className="order-mails-dialog__tracking-error" role="alert"><p className="form-error"><StaticText source={trackingError} /></p><button className="button button--secondary" type="button" onClick={onRetryTracking} disabled={busy || trackingLoading}><StaticText source="Erneut versuchen" /></button></div>}
    {selected && <ShipmentTrackingMailEditor tracking={tracking} events={trackingEvents} saving={busy || trackingLoading || Boolean(trackingError)} saved={savedNotice} canEdit={canEdit} onSave={onSaveTracking} onSaved={() => setSavedNotice(true)} onEdit={() => setSavedNotice(false)} />}
  </MailWorkDialog>, document.body)
}
