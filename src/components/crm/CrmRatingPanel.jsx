import { useEffect, useMemo, useState } from 'react'
import Toast from '../ui/Toast.jsx'
import { useAuth } from '../../auth/useAuth.js'
import {
  calculateOverallScore,
  createCrmRating,
  createEmptyRating,
  formatRatingScore,
  getRatingCriteria,
  getRatingRoles,
  listCrmRatings,
} from '../../lib/crmRatings.js'
import { getHistoryActor } from '../../lib/partnerHistory.js'

const roleLabels = { customer: 'Kundenbewertung', carrier: 'Unternehmerbewertung' }
const initialDrafts = (roles) => Object.fromEntries(roles.map((role) => [role, createEmptyRating(role)]))

export default function CrmRatingPanel({ partner, partnerId, onSaved }) {
  const authState = useAuth()
  const roles = useMemo(() => getRatingRoles(partner), [partner])
  const [ratings, setRatings] = useState(() => Object.fromEntries(roles.map((role) => [role, []])))
  const [drafts, setDrafts] = useState(() => initialDrafts(roles))
  const [openRole, setOpenRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingRole, setSavingRole] = useState('')
  const [errors, setErrors] = useState({})
  const [toast, setToast] = useState('')

  useEffect(() => {
    let current = true
    Promise.all(roles.map(async (role) => [role, await listCrmRatings(partnerId, role)]))
      .then((entries) => { if (current) setRatings(Object.fromEntries(entries)) })
      .catch(() => { if (current) setErrors({ load: 'Die Bewertungen konnten nicht geladen werden.' }) })
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
      await createCrmRating(partnerId, draft, getHistoryActor(authState))
      const nextRatings = await listCrmRatings(partnerId, role)
      setRatings((current) => ({ ...current, [role]: nextRatings }))
      setDrafts((current) => ({ ...current, [role]: createEmptyRating(role) }))
      setOpenRole('')
      setToast('Bewertung gespeichert.')
      onSaved?.()
    } catch {
      setErrors((current) => ({ ...current, [role]: 'Die Bewertung konnte nicht gespeichert werden.' }))
    } finally {
      setSavingRole('')
    }
  }

  return <section className="crm-ratings" aria-label="Bewertung">
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    <div className="crm-ratings__heading"><h3>Aktuelle Bewertungen</h3><span>1 = sehr schlecht, 5 = sehr gut</span></div>
    {errors.load && <p className="form-error">{errors.load}</p>}
    <div className={`crm-ratings__roles crm-ratings__roles--${roles.length}`}>
      {roles.map((role) => {
        const criteria = getRatingCriteria(role)
        const draft = drafts[role]
        const currentRating = ratings[role]?.[0]
        const average = calculateOverallScore(role, draft.scores)
        const isOpen = openRole === role
        return <section className="crm-rating-role" key={role}>
          <div className="crm-rating-role__heading"><div><h4>{roleLabels[role]}</h4><span>{loading ? 'Wird geladen …' : `${currentRating ? `${formatRatingScore(currentRating.overallScore)} / 5` : 'Nicht bewertet'} · ${ratings[role]?.length ?? 0} Bewertungen`}</span></div><button className="button button--secondary" type="button" onClick={() => isOpen ? setOpenRole('') : setOpenRole(role)}>{isOpen ? 'Abbrechen' : `${roleLabels[role]} hinzufügen`}</button></div>
          {isOpen && <div className="crm-rating-form">
            <label className="form-field"><span>Datum</span><input type="date" value={draft.date} onChange={(event) => updateDraft(role, 'date', event.target.value)} required /></label>
            <div className="crm-rating-form__scores">{criteria.map(({ key, label }) => <label key={key}><span>{label}</span><select value={draft.scores[key]} onChange={(event) => updateScore(role, key, event.target.value)}><option value="">—</option>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>)}</div>
            <label className="form-field crm-rating-form__comment"><span>Kommentar / Begründung (optional)</span><textarea value={draft.comment} onChange={(event) => updateDraft(role, 'comment', event.target.value)} rows="2" /></label>
            {errors[role] && <p className="form-error">{errors[role]}</p>}
            <div className="crm-rating-form__actions"><span>{average === null ? 'Gesamtschnitt wird nach vollständiger Eingabe berechnet.' : `Gesamtschnitt: ${formatRatingScore(average)} / 5`}</span><button className="button" type="button" onClick={() => saveRating(role)} disabled={savingRole === role}>{savingRole === role ? 'Wird gespeichert …' : 'Bewertung speichern'}</button></div>
          </div>}
        </section>
      })}
    </div>
  </section>
}
