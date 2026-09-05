import { useAuth } from '../auth/useAuth.js'
import { useTheme } from '../theme/useTheme.js'
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

function ProfileInfoSection({ title, fields }) {
  return <section className="profile-section"><h2>{title}</h2><dl className="profile-readonly-grid">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>
}

export default function ProfilePage() {
  const { user, profile } = useAuth()
  const { theme, setTheme } = useTheme()
  const personalFields = [
    ['Vorname', profile?.firstName || '—'],
    ['Nachname', profile?.lastName || '—'],
    ['Geburtsdatum', formatDate(profile?.birthDate)],
    ['Telefon / Durchwahl', profile?.phone || '—'],
    ['E-Mail / Login', user.email || profile?.email || '—'],
  ]
  const employmentFields = [
    ['Funktion', profile?.jobTitle || profile?.function || '—'],
    ['Abteilung', profile?.department || 'Nicht zugeordnet'],
    ['Rolle', roleLabel(profile?.role)],
    ['Eintrittsdatum', formatDate(profile?.employmentStart)],
    ['Personalnummer', profile?.personnelNumber || '—'],
  ]

  return <div className="profile-page"><p className="profile-page__notice">Diese Angaben werden durch die Administration gepflegt.</p><ProfileInfoSection title="Persönliche Daten" fields={personalFields} /><ProfileInfoSection title="Arbeitsprofil" fields={employmentFields} /><section className="profile-section profile-theme-section"><div><h2>Light &amp; Dark Mode</h2><p>Wähle die Darstellung, die für dich am angenehmsten ist.</p></div><label className="profile-theme-switch"><span><strong>Dunkles Design</strong><small>{theme === 'dark' ? 'Dunkel ist aktiv' : 'Hell ist aktiv'}</small></span><input type="checkbox" checked={theme === 'dark'} onChange={(event) => setTheme(event.target.checked ? 'dark' : 'light')} /><i aria-hidden="true" /></label></section></div>
}
