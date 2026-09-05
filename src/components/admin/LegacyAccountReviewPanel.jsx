import { useEffect, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import ConfirmDialog from '../ui/ConfirmDialog.jsx'
import { functions } from '../../lib/firebase.js'

export default function LegacyAccountReviewPanel() {
  const [profiles, setProfiles] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([
      httpsCallable(functions, 'listLegacyAccountProfiles')(),
      httpsCallable(functions, 'listLegacyAccountMigrationHistory')(),
    ])
      .then(([profilesResult, historyResult]) => { if (active) { setProfiles(profilesResult.data?.profiles || []); setHistory(historyResult.data?.entries || []) } })
      .catch(() => { if (active) setError('Legacy-Profile konnten nicht geladen werden.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  async function confirm() {
    if (!confirming) return
    setSaving(true)
    setError('')
    try {
      await httpsCallable(functions, 'confirmLegacyAccountProfile')({ uid: confirming.uid })
      setProfiles((current) => current.filter((profile) => profile.uid !== confirming.uid))
      const historyResult = await httpsCallable(functions, 'listLegacyAccountMigrationHistory')()
      setHistory(historyResult.data?.entries || [])
      setConfirming(null)
    } catch (confirmationError) {
      setError(confirmationError?.message?.replace(/^.*?:\s*/, '') || 'Das Benutzerkonto konnte nicht bestätigt werden.')
    } finally {
      setSaving(false)
    }
  }

  return <section className="admin-panel legacy-account-review"><ConfirmDialog open={Boolean(confirming)} title="Konto als aktiv bestätigen?" message="Nur bestätigen, wenn dieses Konto einem aktuellen Mitarbeiter zugeordnet ist." confirmLabel="Als aktiv bestätigen" submittingLabel="Wird bestätigt …" isSubmitting={saving} onCancel={() => setConfirming(null)} onConfirm={confirm} /><div className="admin-panel__heading"><div><h2>Kontenprüfung</h2><p>Legacy-Profile ohne festgelegten Aktivstatus kontrolliert bestätigen.</p></div></div>{error && <p className="form-error">{error}</p>}{loading ? <p>Legacy-Profile werden geladen …</p> : profiles.length ? <div className="legacy-account-review__list">{profiles.map((profile) => <article key={profile.uid} className="legacy-account-review__item"><div><strong>{profile.name}</strong><span>{profile.email}</span><span>{profile.role} · {profile.department}</span></div><button className="button button--secondary" type="button" onClick={() => setConfirming(profile)}>Als aktiv bestätigen</button></article>)}</div> : <p className="legacy-account-review__complete">Alle Benutzerprofile sind geprüft.</p>}<div className="legacy-account-review__history"><h3>Letzte Bestätigungen</h3>{history.length ? <div>{history.map((entry) => <p key={entry.uid}><strong>{entry.userName}</strong><span>{entry.confirmedByName} · {entry.confirmedAt?.toDate ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(entry.confirmedAt.toDate()) : '—'}</span></p>)}</div> : <p>Keine Bestätigungen vorhanden.</p>}</div></section>
}
