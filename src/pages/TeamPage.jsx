import { useEffect, useMemo, useState } from 'react'
import { useLanguage } from '../i18n/useLanguage.js'
import { CopyIcon } from '../components/icons.jsx'
import Toast from '../components/ui/Toast.jsx'
import { listVisibleUserDirectory } from '../lib/userProfiles.js'
import { listApprovedVacationRequests, requestOverlaps, todayValue } from '../lib/vacationRequests.js'
import { getMainVacationStatus } from '../lib/vacationStatus.js'
import '../styles/team.css'

function displayName(member) {
  const name = [member.firstName, member.lastName].filter(Boolean).join(' ').trim()
  return name || member.name || member.email || '—'
}

function memberFunction(member) {
  return member.jobTitle || member.function || member.position || '—'
}

function TeamCard({ member, onCopyEmail, onVacation }) {
  const { t } = useLanguage()
  return <article className="team-card"><div className="team-card__heading"><h2>{displayName(member)}</h2><span className={`team-status team-status--${onVacation ? 'vacation' : 'active'}`}><i aria-hidden="true" />{t(onVacation ? 'team.vacation' : 'team.active')}</span></div><div className="team-card__details"><div className="team-card__phone">{member.phone ? <a href={`tel:${member.phone}`} aria-label={t('team.phoneOf', { name: displayName(member) })}>{member.phone}</a> : '—'}</div><div className="team-card__email">{member.email ? <span className="team-email"><a href={`mailto:${member.email}`}>{member.email}</a><button className="team-email__copy" type="button" onClick={() => onCopyEmail(member.email)} aria-label={t('team.copyEmailOf', { name: displayName(member) })} title={t('team.copyEmail')}><CopyIcon /></button></span> : '—'}</div></div></article>
}

export default function TeamPage() {
  const { t } = useLanguage()
  const [members, setMembers] = useState([])
  const [vacationUserIds, setVacationUserIds] = useState(() => new Set())
  const [search, setSearch] = useState('')
  const [department, setDepartment] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => {
    let current = true
    Promise.all([listVisibleUserDirectory(), listApprovedVacationRequests()])
      .then(([profiles, vacations]) => {
        if (!current) return
        setMembers(profiles)
        const today = todayValue()
        setVacationUserIds(new Set(vacations.filter((vacation) => getMainVacationStatus(vacation) === 'approved' && requestOverlaps(vacation, today, today)).map((vacation) => vacation.userId)))
      })
      .catch(() => { if (current) setError(true) })
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
      const name = member.department?.trim() || t('team.noDepartment')
      groups.set(name, [...(groups.get(name) || []), member])
    })
    return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right, 'de'))
  }, [visibleMembers, t])

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
      setToast(t('team.emailCopied'))
    } catch {
      setToast(t('team.emailCopyError'))
    }
  }

  return <div className="team-page">{toast && <Toast message={toast} onDismiss={() => setToast('')} />}<div className="team-toolbar"><label className="search-field"><span className="sr-only">{t('team.search')}</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('team.searchHint')} /></label><label className="filter-field"><span className="sr-only">{t('team.filterDepartment')}</span><select value={department} onChange={(event) => setDepartment(event.target.value)}><option value="all">{t('team.allDepartments')}</option>{departments.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div>{error && <p className="form-error">{t('team.loadError')}</p>}{loading ? <p className="team-state">{t('team.loading')}</p> : !error && (departmentGroups.length ? <div className="team-departments">{departmentGroups.map(([name, groupMembers]) => <section className="team-department" key={name}><h2>{name}</h2><div className="team-grid">{groupMembers.map((member) => <TeamCard key={member.id} member={member} onCopyEmail={copyEmail} onVacation={vacationUserIds.has(member.id)} />)}</div></section>)}</div> : <p className="team-state">{t('team.empty')}</p>)}</div>
}
