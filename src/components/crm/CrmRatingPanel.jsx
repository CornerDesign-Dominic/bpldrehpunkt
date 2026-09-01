import { useEffect, useMemo, useState } from 'react'
import Toast from '../ui/Toast.jsx'
import {
  calculateOverallScore,
  createCrmRating,
  createEmptyRating,
  formatRatingScore,
  getRatingCriteria,
  getRatingRoles,
  listCrmRatings,
} from '../../lib/crmRatings.js'

const roleLabels = { customer: 'Kundenbewertung', carrier: 'Unternehmerbewertung' }

function formatDate(value) {
  return value ? new Intl.DateTimeFormat('de-DE').format(new Date(`${value}T12:00:00`)) : '—'
}

function initialDrafts(roles) {
  return Object.fromEntries(roles.map((role) => [role, createEmptyRating(role)]))
}

export default function CrmRatingPanel({ partner, partnerId }) {
  const roles = useMemo(() => getRatingRoles(partner), [partner])
  const [ratings, setRatings] = useState(() => Object.fromEntries(roles.map((role) => [role, []])))
  const [drafts, setDrafts] = useState(() => initialDrafts(roles))
  const [loading, setLoading] = useState(true)
  const [savingRole, setSavingRole] = useState('')
  const [errors, setErrors] = useState({})
  const [expanded, setExpanded] = useState({})
  const [toast, setToast] = useState('')

  useEffect(() => {
    let current = true
    Promise.all(roles.map(async (role) => [role, await listCrmRatings(partnerId, role)]))
      .then((entries) => { if (current) setRatings(Object.fromEntries(entries)) })
      .catch(() => { if (current) setErrors({ load: 'Die Bewertungshistorie konnte nicht geladen werden.' }) })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [partnerId, roles])

  function updateDraft(role, field, value) {
    setDrafts((current) => ({ ...current, [role]: { ...current[role], [field]: value } }))
  }

  function updateScore(role, key, value) {
    setDrafts((current) => ({ ...current, [role]: { ...current[role], scores: { ...current[role].scores, [key]: value } } }))
  }

  async function saveRating(role) {
    const draft = drafts[role]
    const missingScores = getRatingCriteria(role).some(({ key }) => !draft.scores[key])
    if (!draft.date || missingScores) {
      setErrors((current) => ({ ...current, [role]: 'Bitte Datum und alle Bewertungskriterien erfassen.' }))
      return
    }
    setSavingRole(role)
    setErrors((current) => ({ ...current, [role]: undefined }))
    try {
      await createCrmRating(partnerId, draft)
      const nextRatings = await listCrmRatings(partnerId, role)
      setRatings((current) => ({ ...current, [role]: nextRatings }))
      setDrafts((current) => ({ ...current, [role]: createEmptyRating(role) }))
      setToast('Bewertung gespeichert.')
    } catch {
      setErrors((current) => ({ ...current, [role]: 'Die Bewertung konnte nicht gespeichert werden.' }))
    } finally {
      setSavingRole('')
    }
  }

  return <section className="crm-ratings" aria-label="Bewertung">
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    <div className="crm-ratings__heading"><h3>Bewertung</h3><span>1 = sehr schlecht, 5 = sehr gut</span></div>
    {errors.load && <p className="form-error">{errors.load}</p>}
    <div className={`crm-ratings__roles crm-ratings__roles--${roles.length}`}>
      {roles.map((role) => {
        const draft = drafts[role]
        const criteria = getRatingCriteria(role)
        const overallScore = calculateOverallScore(role, draft.scores)
        const history = ratings[role] ?? []
        const currentRating = history[0]
        return <section className="crm-rating-role" key={role}>
          <div className="crm-rating-role__heading"><div><h4>{roleLabels[role]}</h4><span>Aktuell: {currentRating ? `${formatRatingScore(currentRating.overallScore)} / 5` : 'Nicht bewertet'}</span></div><strong>{overallScore === null ? '— / 5' : `${formatRatingScore(overallScore)} / 5`}</strong></div>
          <div className="crm-rating-form">
            <label className="form-field"><span>Datum</span><input type="date" value={draft.date} onChange={(event) => updateDraft(role, 'date', event.target.value)} required /></label>
            <div className="crm-rating-form__scores">{criteria.map(({ key, label }) => <label key={key}><span>{label}</span><select value={draft.scores[key]} onChange={(event) => updateScore(role, key, event.target.value)}><option value="">—</option>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>)}</div>
            <label className="form-field crm-rating-form__comment"><span>Kommentar / Begründung (optional)</span><textarea value={draft.comment} onChange={(event) => updateDraft(role, 'comment', event.target.value)} rows="2" /></label>
            {errors[role] && <p className="form-error">{errors[role]}</p>}
            <div className="crm-rating-form__actions"><button className="button" type="button" onClick={() => saveRating(role)} disabled={savingRole === role}>{savingRole === role ? 'Wird gespeichert …' : 'Bewertung speichern'}</button></div>
          </div>
          <div className="crm-rating-history">
            <div className="crm-rating-history__header"><span>Bewertungshistorie</span><span>Datum · Gesamt · Kommentar</span></div>
            <div className="crm-rating-history__list">
              {loading && <p>Bewertungen werden geladen …</p>}
              {!loading && history.length === 0 && <p>Noch keine Bewertung vorhanden.</p>}
              {!loading && history.map((rating) => <article key={rating.id} className="crm-rating-history__entry"><div><time dateTime={rating.date}>{formatDate(rating.date)}</time><strong>{formatRatingScore(rating.overallScore)} / 5</strong></div><p>{rating.comment || '—'}</p><button className="text-button" type="button" onClick={() => setExpanded((current) => ({ ...current, [rating.id]: !current[rating.id] }))}>{expanded[rating.id] ? 'Details schließen' : 'Details'}</button>{expanded[rating.id] && <div className="crm-rating-history__scores">{criteria.map(({ key, label }) => <span key={key}>{label}: <strong>{rating.scores?.[key] ?? '—'}</strong></span>)}</div>}</article>)}
            </div>
          </div>
        </section>
      })}
    </div>
  </section>
}
