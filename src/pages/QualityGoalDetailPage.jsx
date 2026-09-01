import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import QualityGoalForm from '../components/quality/QualityGoalForm.jsx'
import Toast from '../components/ui/Toast.jsx'
import {
  addQualityGoalProgress,
  createEmptyQualityGoal,
  createQualityGoal,
  getQualityGoal,
  listQualityGoalProgress,
  updateQualityGoal,
} from '../lib/qualityManagement.js'

function emptyProgress() {
  return { date: new Date().toISOString().slice(0, 10), value: '', note: '' }
}

function formatDate(value) {
  return value ? new Intl.DateTimeFormat('de-DE').format(new Date(`${value}T12:00:00`)) : '—'
}

function formatValue(value, unit) {
  return value === null || value === undefined || value === '' ? '—' : `${value}${unit ? ` ${unit}` : ''}`
}

export default function QualityGoalDetailPage({ mode }) {
  const { goalId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [goal, setGoal] = useState(mode === 'create' ? createEmptyQualityGoal() : null)
  const [progressEntries, setProgressEntries] = useState([])
  const [progress, setProgress] = useState(emptyProgress)
  const [loading, setLoading] = useState(mode === 'existing')
  const [submitting, setSubmitting] = useState(false)
  const [savingProgress, setSavingProgress] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [progressError, setProgressError] = useState('')
  const [toast, setToast] = useState(location.state?.toast ?? '')

  const loadGoal = useCallback(async () => {
    const [nextGoal, nextProgress] = await Promise.all([getQualityGoal(goalId), listQualityGoalProgress(goalId)])
    setGoal(nextGoal)
    setProgressEntries(nextProgress)
    if (!nextGoal) setError('Das Qualitätsziel wurde nicht gefunden.')
  }, [goalId])

  useEffect(() => {
    if (mode === 'create') return undefined
    let current = true
    Promise.all([getQualityGoal(goalId), listQualityGoalProgress(goalId)])
      .then(([nextGoal, nextProgress]) => {
        if (!current) return
        setGoal(nextGoal)
        setProgressEntries(nextProgress)
        if (!nextGoal) setError('Das Qualitätsziel wurde nicht gefunden.')
      })
      .catch(() => { if (current) setError('Das Qualitätsziel konnte nicht geladen werden.') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [goalId, mode])

  async function handleSubmit(values) {
    setSubmitting(true)
    setError('')
    try {
      const savedId = mode === 'create' ? await createQualityGoal(values) : (await updateQualityGoal(goalId, values), goalId)
      if (mode === 'create') navigate(`/qm/ziele/${savedId}`, { state: { toast: 'Qualitätsziel erfolgreich angelegt.' } })
      else {
        setGoal((current) => ({ ...current, ...values }))
        setToast('Änderungen gespeichert.')
      }
      return true
    } catch {
      setError('Speichern nicht möglich. Bitte Firestore-Zugriff und Verbindung prüfen.')
      return false
    } finally {
      setSubmitting(false)
    }
  }

  async function handleProgressSubmit(event) {
    event.preventDefault()
    setProgressError('')
    if (progress.value === '') {
      setProgressError('Bitte einen Fortschrittswert erfassen.')
      return
    }
    setSavingProgress(true)
    try {
      await addQualityGoalProgress(goalId, progress)
      await loadGoal()
      setProgress(emptyProgress())
      setToast('Fortschritt gespeichert.')
    } catch {
      setProgressError('Der Fortschritt konnte nicht gespeichert werden.')
    } finally {
      setSavingProgress(false)
    }
  }

  if (loading) return <p className="page-state">Qualitätsziel wird geladen …</p>
  if (error && !goal) return <section className="page-state page-state--error"><p>{error}</p><Link className="button button--secondary" to="/qm">Zur QM-Übersicht</Link></section>

  const title = goal.title || 'Neues Qualitätsziel'
  return <div className="quality-goal-detail-page">
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    <header className="masterdata-header"><div className="masterdata-header__identity"><h2>{title}</h2>{mode === 'existing' && <div className="detail-header__meta"><span>{goal.period || '—'}</span><span className="qm-status">{goal.status}</span></div>}</div><div className="masterdata-header__actions"><Link className="button button--secondary" to="/qm">Zur Übersicht</Link>{dirty && <span className="dirty-hint">Ungespeicherte Änderungen</span>}<button className="button" type="submit" form="quality-goal-form" disabled={submitting || (mode === 'existing' && !dirty)}>{submitting ? 'Wird gespeichert …' : mode === 'create' ? 'Ziel anlegen' : 'Speichern'}</button></div></header>
    {error && <p className="form-error">{error}</p>}
    <QualityGoalForm key={`${goalId ?? 'new'}-${goal.id ?? 'draft'}`} formId="quality-goal-form" initialValue={goal} onSubmit={handleSubmit} onDirtyChange={setDirty} />
    {mode === 'existing' && <section className="quality-progress">
      <div className="quality-progress__heading"><h3>Fortschritt</h3><span>Aktueller Wert: {formatValue(goal.currentValue, goal.unit)}</span></div>
      <form className="quality-progress__form" onSubmit={handleProgressSubmit}>
        <label className="form-field"><span>Datum</span><input type="date" value={progress.date} onChange={(event) => setProgress((current) => ({ ...current, date: event.target.value }))} required /></label>
        <label className="form-field"><span>Wert</span><input type="number" step="any" value={progress.value} onChange={(event) => setProgress((current) => ({ ...current, value: event.target.value }))} required /></label>
        <label className="form-field quality-progress__note"><span>Kurze Bemerkung</span><input value={progress.note} onChange={(event) => setProgress((current) => ({ ...current, note: event.target.value }))} /></label>
        <button className="button" type="submit" disabled={savingProgress}>{savingProgress ? 'Wird gespeichert …' : 'Fortschritt speichern'}</button>
      </form>
      {progressError && <p className="form-error">{progressError}</p>}
      <div className="table-frame quality-progress__table"><table><thead><tr><th>Datum</th><th>Wert</th><th>Bemerkung</th></tr></thead><tbody>{progressEntries.length ? progressEntries.map((entry) => <tr key={entry.id}><td>{formatDate(entry.date)}</td><td>{formatValue(entry.value, goal.unit)}</td><td>{entry.note || '—'}</td></tr>) : <tr><td className="table-state" colSpan="3">Noch keine Fortschrittswerte erfasst.</td></tr>}</tbody></table></div>
    </section>}
  </div>
}
