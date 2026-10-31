import { StaticText, TranslatedProps } from '../../i18n/AutoTranslate.jsx'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PALLET_ACCOUNT_FILTERS } from '../../constants/pallets.js'
import { getBusinessPartnerType } from '../../lib/businessPartners.js'
import { listPalletAccountSummaries } from '../../lib/palletSummaries.js'
import { formatPalletDate, formatPalletNumber } from './palletFormatters.js'
import { getPartnerEvaluationStatus } from '../../lib/partnerEvaluation.js'
import { usePartnerEvaluationSettings } from '../../partner-evaluation/usePartnerEvaluationSettings.js'
import { palletAccountPath } from '../../lib/businessPartnerLinks.js'
import '../../styles/businessPartnerExtensions.css'
import '../../styles/pallets.css'

function matchesFilter(partner, filter) {
  if (filter === 'all') return true
  const type = getBusinessPartnerType(partner)
  return (filter === 'customer' && type === 'Kunde') || (filter === 'supplier' && type === 'Unternehmer') || (filter === 'both' && type === 'Kunde & Unternehmer')
}

function formatClosing(closing) {
  return closing?.date ? formatPalletDate(closing.date) : '—'
}

const textCollator = new Intl.Collator('de-DE', { numeric: true, sensitivity: 'base' })

function getSortValue({ partner, account }, key) {
  if (key === 'companyName') return partner.companyName ?? ''
  if (key === 'city') return partner.address?.city ?? ''
  if (key === 'debtorNumber') return partner.debtorNumber ? Number(partner.debtorNumber) : null
  if (key === 'creditorNumber') return partner.creditorNumber ? Number(partner.creditorNumber) : null
  if (key === 'balance') return account.balance
  return account.latestClosing?.date ?? ''
}

function sortAccounts(accounts, sort) {
  return [...accounts].sort((first, second) => {
    const firstValue = getSortValue(first, sort.key)
    const secondValue = getSortValue(second, sort.key)
    const firstIsEmpty = firstValue === '' || firstValue === null
    const secondIsEmpty = secondValue === '' || secondValue === null
    if (firstIsEmpty || secondIsEmpty) {
      if (firstIsEmpty && secondIsEmpty) return textCollator.compare(first.partner.companyName ?? '', second.partner.companyName ?? '')
      return firstIsEmpty ? 1 : -1
    }
    const result = typeof firstValue === 'number' ? firstValue - secondValue : textCollator.compare(firstValue, secondValue)
    return sort.direction === 'asc' ? result : result * -1
  })
}

export default function PalletAccountList() {
  const { settings } = usePartnerEvaluationSettings()
  const navigate = useNavigate()
  const [accountsByPartner, setAccountsByPartner] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState({ key: 'companyName', direction: 'asc' })
  const [loading, setLoading] = useState(true)
  const [partnerError, setPartnerError] = useState('')
  const [reload, setReload] = useState(0)
  const accountError = partnerError

  useEffect(() => {
    let active = true
    listPalletAccountSummaries().then(({ accounts }) => { if (active) setAccountsByPartner(accounts) })
      .catch(() => { if (active) setPartnerError('Die Palettenkontoübersicht konnte nicht geladen werden. Bitte Verbindung prüfen und erneut öffnen.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [reload])

  const visibleAccounts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('de-DE')
    const filteredAccounts = accountsByPartner.filter(({ partner }) => matchesFilter(partner, filter) && (!term || [partner.companyName, partner.shortName, partner.address?.city, partner.debtorNumber, partner.creditorNumber].some((value) => String(value ?? '').toLocaleLowerCase('de-DE').includes(term))))
    return sortAccounts(filteredAccounts, sort)
  }, [accountsByPartner, filter, search, sort])

  function toggleSort(key) {
    setSort((current) => current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' })
  }

  function resetFilters() {
    setSearch('')
    setFilter('all')
  }

  function openAccount(partnerId) {
    navigate(palletAccountPath(partnerId))
  }

  function handleAccountRowKeyDown(event, partnerId) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    openAccount(partnerId)
  }

  function renderSortableHeader(key, label) {
    const isActive = sort.key === key
    const direction = isActive ? sort.direction : 'none'
    return <th aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'}><button className="table-sort-button" type="button" onClick={() => toggleSort(key)}><span>{label}</span><span className="table-sort-button__indicator" data-direction={direction} aria-hidden="true" /><span className="sr-only">{<StaticText source={isActive ? `, aktuell ${sort.direction === 'asc' ? 'aufsteigend' : 'absteigend'} sortiert` : ', sortieren'} />}</span></button></th>
  }

  const hasActiveFilters = Boolean(search.trim()) || filter !== 'all'

  const balancePresentation = (balance) => { const status = getPartnerEvaluationStatus('pallets', balance, settings); return <span className="partner-evaluation-value" data-status={status}>{formatPalletNumber(balance, true)}</span> }
  return <div className="pallets-page">
    <div className="list-toolbar pallets-toolbar"><div className="list-controls"><label className="search-field"><span className="sr-only"><StaticText source={"Palettenkonto suchen"} /></span><TranslatedProps sources={{"placeholder":"Geschäftspartner suchen"}}><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Geschäftspartner suchen" type="search" /></TranslatedProps></label><label className="filter-field"><span className="sr-only"><StaticText source={"Partnerfilter"} /></span><select value={filter} onChange={(event) => setFilter(event.target.value)}>{PALLET_ACCOUNT_FILTERS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label></div><button className="button button--secondary" type="button" onClick={resetFilters} disabled={!hasActiveFilters}><StaticText source={"Filter zurücksetzen"} /></button></div>
    {partnerError && <div><p className="form-error"><StaticText source={partnerError} /></p><button className="button button--secondary" type="button" onClick={() => { setLoading(true); setPartnerError(''); setReload((current) => current + 1) }}><StaticText source="Erneut laden" /></button></div>}
    <div className="pallets-table-frame"><table className="data-table"><thead><tr>{<StaticText source={renderSortableHeader('companyName', 'Firmenname')} />}{<StaticText source={renderSortableHeader('city', 'Ort')} />}{<StaticText source={renderSortableHeader('debtorNumber', 'Debitor')} />}{<StaticText source={renderSortableHeader('creditorNumber', 'Kreditor')} />}{renderSortableHeader('balance', 'Saldo')}{<StaticText source={renderSortableHeader('closingDate', 'Letzter Kontoabschluss')} />}</tr></thead><tbody>{loading ? <tr><td colSpan="6" className="table-state"><StaticText source={"Palettenkonten werden geladen …"} /></td></tr> : partnerError ? <tr><td colSpan="6" className="table-state"><StaticText source={"Keine Geschäftspartner verfügbar."} /></td></tr> : visibleAccounts.length ? visibleAccounts.map(({ partner, account }) => <tr className="pallet-account-row" key={partner.id} tabIndex="0" aria-label={`${partner.companyName} öffnen`} onClick={() => openAccount(partner.id)} onKeyDown={(event) => handleAccountRowKeyDown(event, partner.id)}><td><strong>{partner.companyName || partner.id}</strong>{partner.shortName && <span className="table-subline">{partner.shortName}</span>}</td><td>{partner.address?.city || '—'}</td><td>{partner.debtorNumber || '—'}</td><td>{partner.creditorNumber || '—'}</td><td>{accountError ? '—' : balancePresentation(account.balance)}</td><td>{accountError ? '—' : formatClosing(account.latestClosing)}</td></tr>) : <tr><td colSpan="6" className="table-state"><StaticText source={"Keine Geschäftspartner gefunden."} /></td></tr>}</tbody></table></div>
  </div>
}
