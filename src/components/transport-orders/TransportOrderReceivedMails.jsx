import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../../lib/firebase.js'
import { CloseIcon } from '../icons.jsx'

function receivedLabel(value) {
  const date = value?.toDate?.()
  return date ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(date) : '—'
}

const aiLabels = { applied: 'KI-Status übernommen', no_change: 'Keine eindeutige Statusangabe', skipped: 'KI-Auswertung übersprungen', error: 'KI-Auswertung fehlgeschlagen' }

export default function TransportOrderReceivedMails({ transportOrderId }) {
  const [mails, setMails] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const selected = mails.find((mail) => mail.id === selectedId)

  useEffect(() => {
    const mailsQuery = query(collection(db, 'transportOrders', transportOrderId, 'receivedMails'), orderBy('receivedAt', 'desc'), limit(50))
    return onSnapshot(mailsQuery, (snapshot) => {
      setMails(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })))
      setLoading(false)
      setError(false)
    }, () => { setLoading(false); setError(true) })
  }, [transportOrderId])

  return <>
    <section className="transport-order-detail-section transport-order-received-mails" aria-labelledby="transport-order-received-mails-title">
      <h3 id="transport-order-received-mails-title">Eingegangene Mails</h3>
      {loading ? <p>Mails werden geladen …</p> : error ? <p className="form-error">Mails konnten nicht geladen werden.</p> : mails.length === 0 ? <p>Noch keine zugeordneten Mails.</p> : <ol className="transport-order-received-mails__list">{mails.map((mail) => <li key={mail.id}><button type="button" onClick={() => setSelectedId(mail.id)}><span>{mail.subject}</span><small>{receivedLabel(mail.receivedAt)} · {mail.sender}</small>{aiLabels[mail.ai?.status] && <small className={mail.ai.status === 'applied' ? 'transport-order-received-mails__ai' : ''}>{aiLabels[mail.ai.status]}</small>}</button></li>)}</ol>}
    </section>
    {selected && createPortal(<div className="shipment-tracking-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedId(null) }}>
      <section className="shipment-tracking-editor transport-order-received-mail-modal" role="dialog" aria-modal="true" aria-labelledby="received-mail-title">
        <div className="shipment-tracking-editor__heading"><div><h2 id="received-mail-title">{selected.subject}</h2><p>Von {selected.sender} · {receivedLabel(selected.receivedAt)}</p>{aiLabels[selected.ai?.status] && <p className={selected.ai.status === 'applied' ? 'transport-order-received-mails__ai' : ''}>{aiLabels[selected.ai.status]}</p>}</div><button type="button" onClick={() => setSelectedId(null)} aria-label="Dialog schließen"><CloseIcon /></button></div>
        <pre className="transport-order-received-mail-modal__body">{selected.bodyText || 'Kein Textinhalt vorhanden.'}</pre>
        <div className="shipment-tracking-editor__actions"><button className="button button--secondary" type="button" onClick={() => setSelectedId(null)}>Schließen</button></div>
      </section>
    </div>, document.body)}
  </>
}
