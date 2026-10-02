import { StaticText, TranslatedProps } from '../../i18n/AutoTranslate.jsx'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions, waitForAppCheckToken } from '../../lib/firebase.js'
import { CloseIcon } from '../icons.jsx'

function receivedLabel(value) {
  const date = value?.toDate?.()
  return date ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(date) : '—'
}

const aiLabels = { pending: 'KI-Auswertung läuft', applied: 'KI-Status übernommen', no_change: 'Keine Statusangabe erkannt', needs_review: 'Statusangabe manuell prüfen', reviewed: 'Manuelle Prüfung abgeschlossen', skipped: 'KI-Auswertung übersprungen', error: 'KI-Auswertung fehlgeschlagen' }

export default function TransportOrderReceivedMails({ transportOrderId, canEdit = false, onMailsChanged }) {
  const [mails, setMails] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retryingId, setRetryingId] = useState(null)
  const [retryError, setRetryError] = useState('')
  const [resolvingId, setResolvingId] = useState(null)
  const selected = mails.find((mail) => mail.id === selectedId)

  async function retryAi(mailId) {
    setRetryingId(mailId)
    setRetryError('')
    try {
      await waitForAppCheckToken()
      const { data } = await httpsCallable(functions, 'retryStatusMailAi', { timeout: 120000 })({ orderId: transportOrderId, mailId })
      if (!['applied', 'no_change', 'needs_review', 'skipped'].includes(data?.status)) setRetryError('Die KI-Auswertung konnte nicht abgeschlossen werden.')
    } catch {
      setRetryError('Die KI-Auswertung konnte nicht gestartet werden. Bitte erneut versuchen.')
    } finally {
      setRetryingId(null)
    }
  }
  async function resolveReview(mailId) {
    setResolvingId(mailId); setRetryError('')
    try { await waitForAppCheckToken(); await httpsCallable(functions, 'resolveStatusMailReview')({ orderId: transportOrderId, mailId }) } catch { setRetryError('Die manuelle Prüfung konnte nicht abgeschlossen werden.') } finally { setResolvingId(null) }
  }

  useEffect(() => {
    const mailsQuery = query(collection(db, 'transportOrders', transportOrderId, 'receivedMails'), orderBy('receivedAt', 'desc'), limit(50))
    return onSnapshot(mailsQuery, (snapshot) => {
      const next = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }))
      setMails(next); onMailsChanged?.(next)
      setLoading(false)
      setError(false)
    }, () => { setLoading(false); setError(true) })
  }, [transportOrderId, onMailsChanged])

  return <>
    <section className="transport-order-detail-section transport-order-received-mails" aria-labelledby="transport-order-received-mails-title">
      <h3 id="transport-order-received-mails-title"><StaticText source={"Eingegangene Mails"} /></h3>
      {loading ? <p><StaticText source={"Mails werden geladen …"} /></p> : error ? <p className="form-error"><StaticText source={"Mails konnten nicht geladen werden."} /></p> : mails.length === 0 ? <p><StaticText source={"Noch keine zugeordneten Mails."} /></p> : <ol className="transport-order-received-mails__list">{mails.map((mail) => <li key={mail.id}><button className={mail.ai?.reviewRequired || ['needs_review', 'error'].includes(mail.ai?.status) ? 'transport-order-received-mails__needs-review' : ''} type="button" onClick={() => setSelectedId(mail.id)}><span>{mail.subject}</span><small>{receivedLabel(mail.receivedAt)} · {mail.sender}</small>{aiLabels[mail.ai?.status] && <small className={mail.ai.status === 'applied' ? 'transport-order-received-mails__ai' : ''}>{<StaticText source={aiLabels[mail.ai.status]} />}</small>}{mail.ai?.reviewRequired && <small><StaticText source={"Manuelle Prüfung nötig"} /></small>}</button></li>)}</ol>}
    </section>
    {selected && createPortal(<div className="shipment-tracking-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedId(null) }}>
      <section className="shipment-tracking-editor transport-order-received-mail-modal" role="dialog" aria-modal="true" aria-labelledby="received-mail-title">
        <div className="shipment-tracking-editor__heading"><div><h2 id="received-mail-title">{selected.subject}</h2><p><StaticText source={"Von"} /> {selected.sender} · {receivedLabel(selected.receivedAt)}</p>{aiLabels[selected.ai?.status] && <p className={selected.ai.status === 'applied' ? 'transport-order-received-mails__ai' : ''}>{<StaticText source={aiLabels[selected.ai.status]} />}</p>}</div><TranslatedProps sources={{"aria-label":"Dialog schließen"}}><button type="button" onClick={() => setSelectedId(null)} aria-label="Dialog schließen"><CloseIcon /></button></TranslatedProps></div>
        {selected.ai?.reviewRequired && <p className="shipment-tracking-recipients__warning">{selected.ai.reviewReason || <StaticText source={"Statusangabe bitte manuell prüfen."} />}</p>}
        <pre className="transport-order-received-mail-modal__body">{selected.bodyText || <StaticText source={"Kein Textinhalt vorhanden."} />}</pre>
        {retryError && <p className="form-error">{retryError}</p>}
        <div className="shipment-tracking-editor__actions">{canEdit && selected.ai?.reviewRequired && <button className="button" type="button" disabled={resolvingId === selected.id} onClick={() => void resolveReview(selected.id)}>{resolvingId === selected.id ? 'Wird abgeschlossen …' : 'Manuelle Prüfung abschließen'}</button>}{canEdit && ['no_change', 'needs_review', 'error'].includes(selected.ai?.status) && <button className="button button--secondary" type="button" disabled={retryingId === selected.id} onClick={() => void retryAi(selected.id)}>{<StaticText source={retryingId === selected.id ? 'KI wertet aus …' : 'KI erneut auswerten'} />}</button>}<button className="button button--secondary" type="button" onClick={() => setSelectedId(null)}><StaticText source={"Schließen"} /></button></div>
      </section>
    </div>, document.body)}
  </>
}
