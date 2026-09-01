import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getBusinessPartner, getBusinessPartnerType, listBusinessPartners } from '../lib/businessPartners.js'

const palletSections = ['Übersicht', 'Bewegungen', 'Offene Posten / Differenzen']
const accountPlaceholders = ['Saldo', 'Eingang', 'Ausgang', 'Offene Differenzen']

export default function PalletsPage() {
  const { partnerId } = useParams()
  const navigate = useNavigate()
  const [partners, setPartners] = useState([])
  const [search, setSearch] = useState('')
  const [selectionError, setSelectionError] = useState('')
  const [partnerResult, setPartnerResult] = useState(null)

  useEffect(() => {
    listBusinessPartners().then(setPartners).catch(() => setSelectionError('Die Geschäftspartner-Auswahl konnte nicht geladen werden.'))
  }, [])

  useEffect(() => {
    if (!partnerId) return undefined
    let isCurrent = true
    getBusinessPartner(partnerId)
      .then((result) => { if (isCurrent) setPartnerResult({ id: partnerId, partner: result, error: result ? '' : 'Geschäftspartner nicht gefunden.' }) })
      .catch(() => { if (isCurrent) setPartnerResult({ id: partnerId, partner: null, error: 'Geschäftspartner nicht gefunden.' }) })
    return () => { isCurrent = false }
  }, [partnerId])

  const visiblePartners = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('de-DE')
    return partners.filter((item) => !term || [item.companyName, item.shortName].some((value) => value?.toLocaleLowerCase('de-DE').includes(term)))
  }, [partners, search])
  const activeResult = partnerResult?.id === partnerId ? partnerResult : null
  const selectedPartner = activeResult?.partner ?? null
  const partnerError = activeResult?.error ?? ''
  const loadingPartner = Boolean(partnerId && !activeResult)

  function selectPartner(event) {
    const nextId = event.target.value
    navigate(nextId ? `/paletten/${nextId}` : '/paletten')
  }

  return (
    <div className="pallets-page">
      <header className="pallets-heading"><div><h2>Palettenmanagement</h2><p>Palettenkonten und Bewegungen</p></div></header>
      <div className="pallets-selection"><label className="search-field"><span className="sr-only">Geschäftspartner im Palettenmanagement suchen</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Geschäftspartner suchen" /></label><label className="pallets-select"><span className="sr-only">Geschäftspartner auswählen</span><select value={partnerId ?? ''} onChange={selectPartner}><option value="">Geschäftspartner auswählen</option>{visiblePartners.map((item) => <option key={item.id} value={item.id}>{item.companyName}{item.shortName ? ` · ${item.shortName}` : ''}</option>)}</select></label></div>
      {selectionError && <p className="form-error">{selectionError}</p>}
      {!partnerId && <section className="pallets-empty-state"><h3>Geschäftspartner auswählen</h3><p>Wählen Sie einen Geschäftspartner aus, um das zugehörige Palettenkonto zu öffnen.</p></section>}
      {partnerId && loadingPartner && <p className="page-state">Geschäftspartner wird geladen …</p>}
      {partnerId && !loadingPartner && partnerError && <section className="pallets-empty-state pallets-empty-state--error"><h3>{partnerError}</h3><Link className="button button--secondary" to="/paletten">Zur Partnerauswahl</Link></section>}
      {selectedPartner && !loadingPartner && <section className="pallets-context"><div className="pallets-context__identity"><span className="page-kicker">Palettenkonto</span><h3>{selectedPartner.companyName}</h3><span>{getBusinessPartnerType(selectedPartner)}</span></div><dl><div><dt>DyCoS-Debitor</dt><dd>{selectedPartner.debtorNumber || '—'}</dd></div><div><dt>DyCoS-Kreditor</dt><dd>{selectedPartner.creditorNumber || '—'}</dd></div><div><dt>Ort</dt><dd>{selectedPartner.address?.city || '—'}</dd></div></dl></section>}
      {selectedPartner && !loadingPartner && <section className="pallets-workspace"><nav className="pallets-section-nav" aria-label="Künftige Palettenbereiche">{palletSections.map((section) => <span key={section}>{section}</span>)}</nav><div className="pallets-placeholder-grid">{accountPlaceholders.map((label) => <div key={label}><span>{label}</span><strong>—</strong></div>)}</div></section>}
    </div>
  )
}
