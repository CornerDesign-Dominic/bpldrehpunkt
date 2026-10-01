import { StaticText, TranslatedProps } from '../../i18n/AutoTranslate.jsx'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from '../icons.jsx'
import { TRANSPORT_RATING_CRITERIA, validateTransportRating } from '../../../shared/transportOrderRatings.js'

const meanings = ['Sehr schlecht', 'Schlecht', 'Befriedigend', 'Gut', 'Hervorragend']
const roleLabels = { customer: 'Kunde', carrier: 'Unternehmer' }
const roles = ['customer', 'carrier']

function criteriaFor(role) {
  const byKey = Object.fromEntries(TRANSPORT_RATING_CRITERIA[role].map((criterion) => [criterion.key, criterion]))
  if (role === 'customer') return [
    { ...byKey.compensation, label: 'Preis' },
    { ...byKey.cooperation, label: 'Kommunikation' },
    byKey.orderQuality,
  ]
  return [byKey.price, byKey.communication, byKey.punctuality, byKey.execution]
}

function sameDraft(role, draft, rating) {
  const initialScores = rating?.scores || {}
  const scoreIsSame = TRANSPORT_RATING_CRITERIA[role].every(({ key }) => (draft.scores[key] ?? null) === (initialScores[key] ?? null))
  return scoreIsSame && draft.comment.trim() === (rating?.comment || '').trim()
}

function RatingPanel({ role, partner, draft, onChange, disabled }) {
  const criteria = criteriaFor(role)
  const hasPartner = Boolean(partner?.id)
  let average = null
  try { average = validateTransportRating(role, draft.scores, draft.comment).averageScore } catch { /* Noch keine vollständige Teilbewertung. */ }

  return <section className="transport-ratings-modal__panel">
    <div className="transport-ratings-modal__panel-heading"><div><h3>{<StaticText source={roleLabels[role]} />}</h3><p>{partner?.companyName || <StaticText source={"Partner nicht verfügbar"} />}</p></div>{average !== null && <strong>Ø {new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(average)} / 5</strong>}</div>
    {!hasPartner ? <p className="form-error"><StaticText source={"Dieser Partner kann derzeit nicht bewertet werden."} /></p> : <><div className="transport-ratings-modal__criteria">{criteria.map(({ key, label, description }) => <div className="transport-ratings-modal__criterion" key={key}><div><strong>{label}</strong><small>{description}</small></div><div className="transport-ratings-modal__stars" role="group" aria-label={label}>{meanings.map((meaning, index) => { const value = index + 1; return <button key={value} type="button" className={value <= (draft.scores[key] || 0) ? 'is-selected' : ''} title={`${value} – ${meaning}`} aria-label={`${label}: ${value} – ${meaning}`} aria-pressed={draft.scores[key] === value} onClick={() => onChange({ ...draft, scores: { ...draft.scores, [key]: draft.scores[key] === value ? undefined : value } })} disabled={disabled}>{'★'}</button> })}</div></div>)}{role === 'customer' && <div className="transport-ratings-modal__criterion transport-ratings-modal__criterion--placeholder" aria-hidden="true" />}</div>
      <label className="form-field transport-ratings-modal__comment"><span><StaticText source={"Kommentar (optional)"} /></span><textarea rows="2" maxLength="250" value={draft.comment} onChange={(event) => onChange({ ...draft, comment: event.target.value })} disabled={disabled} /><small>{draft.comment.length} / 250</small></label></>}
  </section>
}

export default function TransportOrderRatingsModal({ order, ratings, partners, canEdit, onClose, onSave }) {
  const [drafts, setDrafts] = useState(() => Object.fromEntries(roles.map((role) => [role, { scores: ratings[role]?.scores || {}, comment: ratings[role]?.comment || '' }])))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const changedRoles = roles.filter((role) => Boolean(partners[role]?.id) && !sameDraft(role, drafts[role], ratings[role]))

  async function submit(event) {
    event.preventDefault()
    if (!canEdit) { setError('Keine Berechtigung zum Bewerten.'); return }
    if (!changedRoles.length) { setError('Es wurden keine Änderungen vorgenommen.'); return }
    try {
      const updates = changedRoles.map((role) => ({
        transportOrderId: order.id,
        partnerId: partners[role].id,
        partnerRole: role,
        ...validateTransportRating(role, drafts[role].scores, drafts[role].comment),
      }))
      setError('')
      setSaving(true)
      await onSave(updates)
    } catch (caught) {
      setError(caught?.message?.startsWith('Bitte mindestens') || caught?.message?.startsWith('Sterne') || caught?.message?.startsWith('Der Kommentar') ? caught.message : 'Die Bewertungen konnten nicht gespeichert werden.')
    } finally { setSaving(false) }
  }

  return createPortal(<div className="shipment-tracking-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}>
    <section className="shipment-tracking-editor transport-ratings-modal" role="dialog" aria-modal="true" aria-labelledby="transport-ratings-title">
      <div className="shipment-tracking-editor__heading"><div><h2 id="transport-ratings-title"><StaticText source={"Bewertungen"} /></h2><p>TA {order?.externalNumber || '—'}</p></div><TranslatedProps sources={{"aria-label":"Dialog schließen"}}><button type="button" onClick={onClose} aria-label="Dialog schließen" disabled={saving}><CloseIcon /></button></TranslatedProps></div>
      <form onSubmit={(event) => void submit(event)}>
        <div className="transport-ratings-modal__panels">{roles.map((role) => <RatingPanel key={role} role={role} partner={partners[role]} draft={drafts[role]} onChange={(next) => { setDrafts((current) => ({ ...current, [role]: next })); setError('') }} disabled={!canEdit || saving} />)}</div>
        {error && <p className="form-error" role="alert">{<StaticText source={error} />}</p>}
        <div className="shipment-tracking-editor__actions"><button className="button button--secondary" type="button" onClick={onClose} disabled={saving}><StaticText source={"Abbrechen"} /></button>{canEdit && <button className="button" type="submit" disabled={saving || !changedRoles.length}>{<StaticText source={saving ? 'Wird gespeichert …' : 'Änderungen speichern'} />}</button>}</div>
      </form>
    </section>
  </div>, document.body)
}
