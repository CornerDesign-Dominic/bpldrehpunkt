import { useEffect, useMemo, useState } from 'react'
import { CopyIcon } from '../components/icons.jsx'
import Toast from '../components/ui/Toast.jsx'
import { getUserAvailabilityStatus, listUserProfiles } from '../lib/userProfiles.js'
import '../styles/team.css'

function displayName(member) {
  const name = [member.firstName, member.lastName].filter(Boolean).join(' ').trim()
  return name || member.name || member.email || '—'
}

function memberFunction(member) {
  return member.jobTitle || member.function || member.position || '—'
}

function isOnVacation(member) {
  return getUserAvailabilityStatus(member)?.value === 'vacation'
}

function TeamCard({ member, onCopyEmail }) {
  const onVacation = isOnVacation(member)
  return <article className="team-card"><div className="team-card__heading"><h2>{displayName(member)}</h2><span className={`team-status team-status--${onVacation ? 'vacation' : 'active'}`}><i aria-hidden="true" />{onVacation ? 'Im Urlaub' : 'Aktiv'}</span></div><dl className="team-card__details"><div><dt>Telefon / Durchwahl</dt><dd>{member.phone ? <a href={`tel:${member.phone}`}>{member.phone}</a> : '—'}</dd></div><div className="team-card__email"><dt>E-Mail</dt><dd>{member.email ? <span className="team-email"><a href={`mailto:${member.email}`}>{member.email}</a><button className="team-email__copy" type="button" onClick={() => onCopyEmail(member.email)} aria-label={`E-Mail-Adresse von ${displayName(member)} kopieren`} title="E-Mail-Adresse kopieren"><CopyIcon /></button></span> : '—'}</dd></div></dl></article>
}

export default function TeamPage() {
  const [members, setMembers] = useState([])
  const [search, setSearch] = useState('')
  const [department, setDepartment] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  useEffect(() => {
    let current = true
    listUserProfiles()
      .then((profiles) => { if (current) setMembers(profiles) })
      .catch(() => { if (current) setError('Das Teamverzeichnis konnte nicht geladen werden.') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [])

  const departments = useMemo(() => [...new Set(members.map((member) => member.department?.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right, 'de')), [members])
  const visibleMembers = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('de-DE')
    return members
      .filter((member) => department === 'all' || member.department?.trim() === department)
      .filter((member) => !term || [displayName(member), member.department, memberFunction(member)].some((value) => value?.toLocaleLowerCase('de-DE').includes(term)))
      .sort((left, right) => displayName(left).localeCompare(displayName(right), 'de'))
  }, [department, members, search])

  const departmentGroups = useMemo(() => {
    const groups = new Map()
    visibleMembers.forEach((member) => {
      const name = member.department?.trim() || 'Ohne Abteilung'
      groups.set(name, [...(groups.get(name) || []), member])
    })
    return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right, 'de'))
  }, [visibleMembers])

  async function copyEmail(email) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(email)
      } else {
        const input = document.createElement('textarea')
        input.value = email
        input.setAttribute('readonly', '')
        input.style.position = 'fixed'
        input.style.opacity = '0'
        document.body.append(input)
        input.select()
        document.execCommand('copy')
        input.remove()
      }
      setToast('E-Mail-Adresse kopiert.')
    } catch {
      setToast('E-Mail-Adresse konnte nicht kopiert werden.')
    }
  }

  return <div className="team-page">{toast && <Toast message={toast} onDismiss={() => setToast('')} />}<div className="team-toolbar"><label className="search-field"><span className="sr-only">Team durchsuchen</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, Abteilung oder Funktion suchen" /></label><label className="filter-field"><span className="sr-only">Abteilung filtern</span><select value={department} onChange={(event) => setDepartment(event.target.value)}><option value="all">Alle Abteilungen</option>{departments.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div>{error && <p className="form-error">{error}</p>}{loading ? <p className="team-state">Team wird geladen …</p> : !error && (departmentGroups.length ? <div className="team-departments">{departmentGroups.map(([name, groupMembers]) => <section className="team-department" key={name}><h2>{name}</h2><div className="team-grid">{groupMembers.map((member) => <TeamCard key={member.id} member={member} onCopyEmail={copyEmail} />)}</div></section>)}</div> : <p className="team-state">Keine Mitarbeiter gefunden.</p>)}</div>
}
