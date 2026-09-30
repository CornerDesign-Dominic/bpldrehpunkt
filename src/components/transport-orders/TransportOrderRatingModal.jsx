import { useState } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from '../icons.jsx'
import { TRANSPORT_RATING_CRITERIA, validateTransportRating } from '../../../shared/transportOrderRatings.js'

const meanings = ['Sehr schlecht', 'Schlecht', 'Befriedigend', 'Gut', 'Hervorragend']
const roleLabels = { customer: 'Kunde', carrier: 'Unternehmer' }

export default function TransportOrderRatingModal({ role, partner, order, rating, canEdit, onClose, onSave }) {
  const [scores, setScores] = useState(() => rating?.scores || {})
  const [comment, setComment] = useState(() => rating?.comment || '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const criteria = TRANSPORT_RATING_CRITERIA[role]
  const hasPartner = Boolean(partner?.id)
  const hasOrder = Boolean(order?.id)
  let average = null
  try { average = validateTransportRating(role, scores, comment).averageScore } catch { /* Leere Teilbewertung. */ }

  async function submit(event) {
    event.preventDefault()
    if (!hasOrder) { setError('Transportauftrag fehlt.'); return }
    if (!hasPartner) { setError('Partner fehlt oder konnte nicht geladen werden.'); return }
    if (!canEdit) { setError('Keine Berechtigung zum Bewerten.'); return }
    try {
      const normalized = validateTransportRating(role, scores, comment)
      setError('')
      setSaving(true)
      await onSave({ transportOrderId: order.id, partnerId: partner.id, partnerRole: role, scores: normalized.scores, comment: normalized.comment })
    } catch (caught) {
      setError(caught?.message?.startsWith('Bitte mindestens') || caught?.message?.startsWith('Sterne') || caught?.message?.startsWith('Der Kommentar') ? caught.message : 'Die Bewertung konnte nicht gespeichert werden.')
    } finally { setSaving(false) }
  }

  return createPortal(<div className="shipment-tracking-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}>
    <section className="shipment-tracking-editor transport-rating-modal" role="dialog" aria-modal="true" aria-labelledby="transport-rating-title">
      <div className="shipment-tracking-editor__heading"><div><h2 id="transport-rating-title">{rating ? 'Bewertung bearbeiten' : `${roleLabels[role]} bewerten`}</h2><p>{roleLabels[role]} · {partner?.companyName || 'Partner fehlt'} · TA {order?.externalNumber || '—'}</p></div><button type="button" onClick={onClose} aria-label="Dialog schließen" disabled={saving}><CloseIcon /></button></div>
      <form onSubmit={(event) => void submit(event)}>
        <div className="transport-rating-modal__criteria">{criteria.map(({ key, label, description }) => <div className="transport-rating-modal__criterion" key={key}><div><strong>{label}</strong><small>{description}</small></div><div className="transport-rating-modal__stars" role="group" aria-label={label}>{meanings.map((meaning, index) => { const value = index + 1; return <button key={value} type="button" className={value <= (scores[key] || 0) ? 'is-selected' : ''} title={`${value} – ${meaning}`} aria-label={`${label}: ${value} – ${meaning}`} aria-pressed={scores[key] === value} onClick={() => { setScores((current) => ({ ...current, [key]: current[key] === value ? undefined : value })); setError('') }} disabled={!canEdit || saving}>{'★'}</button> })}</div></div>)}</div>
        <label className="form-field transport-rating-modal__comment"><span>Kommentar (optional)</span><textarea rows="2" maxLength="250" value={comment} onChange={(event) => setComment(event.target.value)} disabled={!canEdit || saving} /><small>{comment.length} / 250</small></label>
        {(!hasPartner || !hasOrder || !canEdit) && <p className="form-error">{!hasOrder ? 'Transportauftrag fehlt.' : !hasPartner ? 'Partner fehlt oder konnte nicht geladen werden.' : 'Keine Berechtigung zum Bewerten.'}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="shipment-tracking-editor__actions"><span className="transport-rating-modal__average">{average === null ? 'Noch kein Kriterium bewertet' : `Durchschnitt: ${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(average)} / 5`}</span><button className="button button--secondary" type="button" onClick={onClose} disabled={saving}>Schließen</button>{canEdit && <button className="button" type="submit" disabled={saving || !hasPartner || !hasOrder}>{saving ? 'Wird gespeichert …' : 'Speichern'}</button>}</div>
      </form>
    </section>
  </div>, document.body)
}
