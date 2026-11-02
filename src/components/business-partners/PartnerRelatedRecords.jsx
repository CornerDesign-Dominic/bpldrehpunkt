import { useEffect, useMemo, useState } from 'react'
import { usePermissions } from '../../auth/usePermissions.js'
import { useAuth } from '../../auth/useAuth.js'
import { StaticText } from '../../i18n/AutoTranslate.jsx'
import { listPartnerRelatedRecords } from '../../lib/partnerRelatedRecords.js'
import { reportTechnicalFailure } from '../../lib/diagnostics.js'
import { recordDetailPath } from '../../lib/recordNavigation.js'
import ContextLink from '../ui/ContextLink.jsx'

const modules = ['damages', 'insolvencies', 'inkasso', 'legalDisputes', 'todos', 'transportOrders']

function recordLabel(type, record) {
  if (type === 'transportOrder') return `TA ${record.externalNumber || record.imported?.externalNumber || record.id}`
  return [record.caseNumber, record.title || record.partnerName || record.debtorName].filter(Boolean).join(' · ') || record.id
}

export default function PartnerRelatedRecords({ partnerId }) {
  const { canView } = usePermissions()
  const { user, profile, isLoading } = useAuth()
  const actor = useMemo(() => ({ user, profile }), [user, profile])
  const actorKey = JSON.stringify([user?.uid, profile?.role, profile?.department])
  const allowed = modules.filter((module) => canView(module)).join(',')
  const [open, setOpen] = useState(false)
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (!open || !partnerId || !allowed || isLoading || !user?.uid) return undefined
    let active = true
    listPartnerRelatedRecords(partnerId, allowed.split(','), actor)
      .then((groups) => { if (active) setResult({ partnerId, allowed, actorKey, retry, groups }) })
      .catch((error) => {
        void reportTechnicalFailure({ module: 'partner-links', stage: 'load', recordId: partnerId, error })
        if (active) setResult({ partnerId, allowed, actorKey, retry, error: 'Verknüpfte Vorgänge konnten nicht geladen werden.' })
      })
    return () => { active = false }
  }, [actor, actorKey, allowed, isLoading, open, partnerId, retry, user?.uid])

  if (!allowed || isLoading || !user?.uid) return null
  const current = result?.partnerId === partnerId && result.allowed === allowed && result.actorKey === actorKey && result.retry === retry ? result : null
  const partial = current?.groups?.some((group) => group.failedQueries)
  return <details className="partner-related-records" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}><summary><StaticText source="Verknüpfte Vorgänge" /></summary>{open && <div>
    {!current ? <p><StaticText source="Verknüpfte Vorgänge werden geladen …" /></p> : current.error ? <p className="form-error"><StaticText source={current.error} /></p> : current.groups.map((group) => <section key={group.module}><h3><StaticText source={group.label} /></h3>{group.failedQueries > 0 && <p className="form-error"><StaticText source="Ein Teil der Verknüpfungen konnte nicht geladen werden. Die Liste ist unvollständig." /></p>}{group.records.length ? <ul>{group.records.map((record) => <li key={record.id}><ContextLink to={recordDetailPath(group.type, record.id)}>{recordLabel(group.type, record)}</ContextLink></li>)}</ul> : !group.failedQueries && <p><StaticText source="Keine verknüpften Vorgänge." /></p>}</section>)}
    {(current?.error || partial) && <button className="button button--secondary" type="button" onClick={() => setRetry((value) => value + 1)}><StaticText source="Erneut versuchen" /></button>}
  </div>}</details>
}
