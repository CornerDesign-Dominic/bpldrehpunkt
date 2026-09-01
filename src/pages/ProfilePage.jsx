import { useState } from 'react'
import Toast from '../components/ui/Toast.jsx'
import { useAuth } from '../auth/useAuth.js'
import { updateOwnUserProfile } from '../lib/userProfiles.js'
import '../styles/profile.css'

function formatDate(value) {
  if (!value) return '—'
  const date = value.toDate?.() ?? new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('de-DE').format(date)
}

function roleLabel(role) {
  if (role === 'admin') return 'Administrator'
  if (role === 'user') return 'Benutzer'
  return role || '—'
}

function ProfileForm({ user, profile, refreshProfile, onSaved }) {
  const [form, setForm] = useState(() => ({ firstName: profile?.firstName ?? '', lastName: profile?.lastName ?? '', birthDate: profile?.birthDate ?? '', phone: profile?.phone ?? '', mobile: profile?.mobile ?? '' }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function change(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function save(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await updateOwnUserProfile(user, form)
      await refreshProfile()
      onSaved()
    } catch {
      setError('Profil konnte nicht gespeichert werden.')
    } finally {
      setSaving(false)
    }
  }

  const readOnlyFields = [
    ['E-Mail / Login', user.email || profile?.email || '—'],
    ['Abteilung', profile?.department || 'Nicht zugeordnet'],
    ['Rolle', roleLabel(profile?.role)],
    ['Status', profile?.active === false ? 'Inaktiv' : 'Aktiv'],
    ['Eintrittsdatum', formatDate(profile?.employmentStart)],
    ['Personalnummer', profile?.personnelNumber || '—'],
  ]

  return <form className="profile-page" onSubmit={save} noValidate>
    <section className="profile-section"><div className="profile-section__heading"><h2>Persönliche Daten</h2><p>Diese Angaben können Sie selbst pflegen.</p></div><div className="profile-edit-grid"><label className="form-field"><span>Vorname</span><input value={form.firstName} onChange={(event) => change('firstName', event.target.value)} autoComplete="given-name" /></label><label className="form-field"><span>Nachname</span><input value={form.lastName} onChange={(event) => change('lastName', event.target.value)} autoComplete="family-name" /></label><label className="form-field"><span>Geburtsdatum</span><input type="date" value={form.birthDate} onChange={(event) => change('birthDate', event.target.value)} /></label><label className="form-field"><span>Telefon</span><input type="tel" value={form.phone} onChange={(event) => change('phone', event.target.value)} autoComplete="tel" /></label><label className="form-field"><span>Mobil (optional)</span><input type="tel" value={form.mobile} onChange={(event) => change('mobile', event.target.value)} autoComplete="tel-national" /></label></div><div className="form-actions"><button className="button" type="submit" disabled={saving}>{saving ? 'Wird gespeichert …' : 'Speichern'}</button></div></section>
    <section className="profile-section profile-section--readonly"><div className="profile-section__heading"><h2>Arbeitsprofil</h2><p>Diese Angaben werden durch die Administration gepflegt.</p></div><dl className="profile-readonly-grid">{readOnlyFields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>
    {error && <p className="form-error">{error}</p>}
  </form>
}

export default function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth()
  const [toast, setToast] = useState('')
  return <>{toast && <Toast message={toast} onDismiss={() => setToast('')} />}<ProfileForm key={`${user.uid}-${profile?.updatedAt?.toMillis?.() ?? 'initial'}`} user={user} profile={profile} refreshProfile={refreshProfile} onSaved={() => setToast('Profil gespeichert.')} /></>
}
