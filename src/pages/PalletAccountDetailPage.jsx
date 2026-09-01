import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Toast from '../components/ui/Toast.jsx'
import { getBusinessPartner, getBusinessPartnerType, listBusinessPartners } from '../lib/businessPartners.js'
import { calculatePalletMovement, createPalletClosing, createPalletMovement, listPalletClosings, listPalletMovements, summarizePalletAccount } from '../lib/palletAccounts.js'

const closingTypes = ['Rechnung', 'Verrechnung', 'Rückgabe / Ausgleich', 'Sonstiges']
const currentDate = () => new Date().toISOString().slice(0, 10)

function formatNumber(value, withSign = false) {
  const number = Number(value) || 0
  return `${withSign && number > 0 ? '+' : ''}${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(number)}`
}

function formatDate(date) {
  return new Intl.DateTimeFormat('de-DE').format(new Date(`${date}T00:00:00`))
}

function formatLastClosing(closing) {
  return closing ? `${formatDate(closing.date)} · ${formatNumber(closing.newBalance, true)}` : '—'
}

function createMovementForm(partner) {
  const isCarrier = Boolean(partner?.creditorNumber?.trim())
  const isCustomer = Boolean(partner?.debtorNumber?.trim())
  return {
    tourNumber: '',
    date: currentDate(),
    customerId: isCustomer && !isCarrier ? partner.id : '',
    carrierId: isCarrier ? partner.id : '',
    palletReceiptNumber: '',
    note: '',
    loadingPoint: { received: '', delivered: '' },
    unloadingPoint: { received: '', delivered: '' },
  }
}

function createClosingForm(balance) {
  return { date: currentDate(), type: 'Rechnung', reference: '', note: '', adjustment: '', previousBalance: balance }
}

function fetchAccountData(partnerId) {
  return Promise.all([listPalletMovements(partnerId), listPalletClosings(partnerId)])
}

function isValidQuantity(value) {
  return value === '' || /^\d+$/.test(value)
}

function isNonNegativeInteger(value) {
  return Number.isInteger(Number(value || 0)) && Number(value || 0) >= 0
}

export default function PalletAccountDetailPage() {
  const { partnerId } = useParams()
  const [partnerResult, setPartnerResult] = useState(null)
  const [partners, setPartners] = useState([])
  const [movements, setMovements] = useState([])
  const [closings, setClosings] = useState([])
  const [accountError, setAccountError] = useState('')
  const [activeForm, setActiveForm] = useState('')
  const [movementForm, setMovementForm] = useState(() => createMovementForm())
  const [closingForm, setClosingForm] = useState(() => createClosingForm(0))
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => {
    let isCurrent = true
    getBusinessPartner(partnerId)
      .then((partner) => { if (isCurrent) setPartnerResult({ partner, error: partner ? '' : 'Geschäftspartner nicht gefunden.' }) })
      .catch(() => { if (isCurrent) setPartnerResult({ partner: null, error: 'Geschäftspartner nicht gefunden.' }) })
    listBusinessPartners().then((loadedPartners) => { if (isCurrent) setPartners(loadedPartners) }).catch(() => { if (isCurrent) setAccountError('Geschäftspartner für die Bewegungsauswahl konnten nicht geladen werden.') })
    fetchAccountData(partnerId)
      .then(([loadedMovements, loadedClosings]) => { if (isCurrent) { setMovements(loadedMovements); setClosings(loadedClosings) } })
      .catch(() => { if (isCurrent) setAccountError('Palettenbuchungen konnten nicht geladen werden.') })
    return () => { isCurrent = false }
  }, [partnerId])

  const account = useMemo(() => summarizePalletAccount(movements, closings, partnerId), [closings, movements, partnerId])
  const movementCalculation = useMemo(() => calculatePalletMovement(movementForm), [movementForm])
  const newClosingBalance = account.balance + (Number(closingForm.adjustment) || 0)
  const partnersById = useMemo(() => new Map(partners.map((partner) => [partner.id, partner])), [partners])
  const customers = useMemo(() => partners.filter((partner) => partner.debtorNumber?.trim()), [partners])
  const carriers = useMemo(() => partners.filter((partner) => partner.creditorNumber?.trim()), [partners])
  const selectedCustomer = partnersById.get(movementForm.customerId)
  const selectedCarrier = partnersById.get(movementForm.carrierId)

  function openForm(form, partner) {
    setFormError('')
    setActiveForm(form)
    if (form === 'closing') setClosingForm(createClosingForm(account.balance))
    if (form === 'movement') setMovementForm(createMovementForm(partner))
  }

  function updateStation(point, field, value) {
    if (!isValidQuantity(value)) return
    setMovementForm({ ...movementForm, [point]: { ...movementForm[point], [field]: value } })
  }

  async function handleMovementSubmit(event) {
    event.preventDefault()
    const quantities = [movementForm.loadingPoint.received, movementForm.loadingPoint.delivered, movementForm.unloadingPoint.received, movementForm.unloadingPoint.delivered]
    const hasMovement = quantities.some((value) => Number(value || 0) > 0)

    if (!movementForm.tourNumber.trim() || !movementForm.date) return setFormError('Tournummer und Datum sind erforderlich.')
    if (!movementForm.customerId && !movementForm.carrierId) return setFormError('Wählen Sie mindestens einen Kunden oder Unternehmer aus.')
    if (!quantities.every(isNonNegativeInteger)) return setFormError('Palettenmengen müssen nicht-negative ganze Zahlen sein.')
    if (!hasMovement) return setFormError('Erfassen Sie mindestens eine Palettenmenge ungleich 0.')

    setIsSubmitting(true)
    setFormError('')
    try {
      await createPalletMovement(movementForm)
      const [loadedMovements, loadedClosings] = await fetchAccountData(partnerId)
      setMovements(loadedMovements)
      setClosings(loadedClosings)
      setActiveForm('')
      setToast('Palettenbewegung gespeichert.')
    } catch {
      setFormError('Die Palettenbewegung konnte nicht gespeichert werden.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleClosingSubmit(event) {
    event.preventDefault()
    const adjustment = Number(closingForm.adjustment)
    if (!closingForm.date || !Number.isFinite(adjustment) || adjustment === 0) return setFormError('Datum und eine Saldoänderung ungleich 0 sind erforderlich.')

    setIsSubmitting(true)
    setFormError('')
    try {
      await createPalletClosing(partnerId, { ...closingForm, previousBalance: account.balance, newBalance: newClosingBalance })
      const [loadedMovements, loadedClosings] = await fetchAccountData(partnerId)
      setMovements(loadedMovements)
      setClosings(loadedClosings)
      setActiveForm('')
      setToast('Kontoabschluss gespeichert.')
    } catch {
      setFormError('Der Kontoabschluss konnte nicht gespeichert werden.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!partnerResult) return <p className="page-state">Geschäftspartner wird geladen …</p>
  if (partnerResult.error) return <section className="pallets-empty-state pallets-empty-state--error"><h3>{partnerResult.error}</h3><Link className="button button--secondary" to="/paletten">Zurück zur Übersicht</Link></section>

  const { partner } = partnerResult
  const address = [partner.address?.street, partner.address?.houseNumber].filter(Boolean).join(' ') || '—'
  const location = [partner.address?.postalCode, partner.address?.city].filter(Boolean).join(' ') || '—'

  return (
    <div className="pallet-account-page">
      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
      <header className="pallet-account-header"><div><span className="page-kicker">Palettenkonto</span><h2>{partner.companyName}</h2><div className="pallet-account-header__meta"><span>{getBusinessPartnerType(partner)}</span><span>{address}</span><span>{location}</span><span>{partner.address?.country || '—'}</span><span>DyCoS-Debitor: {partner.debtorNumber || '—'}</span><span>DyCoS-Kreditor: {partner.creditorNumber || '—'}</span></div></div><div className="pallet-account-header__actions"><button className="button" type="button" onClick={() => openForm('movement', partner)}>Bewegung hinzufügen</button><button className="button button--secondary" type="button" onClick={() => openForm('closing', partner)}>Abschluss hinzufügen</button><Link className="button button--secondary" to="/paletten">Zurück zur Übersicht</Link><Link className="button button--secondary" to={`/kunden-unternehmer/${partnerId}`}>Zu den Stammdaten</Link></div></header>
      <section className="pallet-account-summary"><div><span>Aktueller Palettensaldo</span><strong>{accountError ? '—' : formatNumber(account.balance, true)}</strong></div><div><span>Letzter Kontoabschluss</span><strong>{accountError ? '—' : formatLastClosing(account.latestClosing)}</strong></div></section>
      {accountError && <p className="form-error">{accountError}</p>}
      {activeForm === 'movement' && <form className="pallet-entry-form pallet-movement-form" onSubmit={handleMovementSubmit}><div className="pallet-entry-form__header"><h3>Bewegung hinzufügen</h3><button className="button button--secondary" type="button" onClick={() => setActiveForm('')}>Abbrechen</button></div><div className="pallet-movement-form__header"><label className="form-field"><span>Tournummer / unsere Nummer</span><input value={movementForm.tourNumber} onChange={(event) => setMovementForm({ ...movementForm, tourNumber: event.target.value })} /></label><label className="form-field"><span>Datum</span><input type="date" value={movementForm.date} onChange={(event) => setMovementForm({ ...movementForm, date: event.target.value })} /></label><label className="form-field"><span>Kunde</span><select value={movementForm.customerId} onChange={(event) => setMovementForm({ ...movementForm, customerId: event.target.value })}><option value="">Kein Kunde</option>{customers.map((item) => <option key={item.id} value={item.id}>{item.companyName} · Debitor {item.debtorNumber}</option>)}</select></label><label className="form-field"><span>Unternehmer</span><select value={movementForm.carrierId} onChange={(event) => setMovementForm({ ...movementForm, carrierId: event.target.value })}><option value="">Kein Unternehmer</option>{carriers.map((item) => <option key={item.id} value={item.id}>{item.companyName} · Kreditor {item.creditorNumber}</option>)}</select></label><label className="form-field"><span>Palettenschein-Nr.</span><input value={movementForm.palletReceiptNumber} onChange={(event) => setMovementForm({ ...movementForm, palletReceiptNumber: event.target.value })} /></label><label className="form-field pallet-movement-form__wide"><span>Bemerkung</span><input value={movementForm.note} onChange={(event) => setMovementForm({ ...movementForm, note: event.target.value })} /></label></div><div className="pallet-movement-partners">{selectedCustomer && <div><span>Kunde</span><strong>{selectedCustomer.companyName}</strong><small>DyCoS Debitor: {selectedCustomer.debtorNumber}</small></div>}{selectedCarrier && <div><span>Unternehmer</span><strong>{selectedCarrier.companyName}</strong><small>DyCoS Kreditor: {selectedCarrier.creditorNumber}</small></div>}</div><div className="pallet-stations"><fieldset><legend>Ladestelle</legend><div><label className="form-field"><span>Erhalten</span><input inputMode="numeric" min="0" step="1" type="number" value={movementForm.loadingPoint.received} onChange={(event) => updateStation('loadingPoint', 'received', event.target.value)} /></label><label className="form-field"><span>Abgegeben</span><input inputMode="numeric" min="0" step="1" type="number" value={movementForm.loadingPoint.delivered} onChange={(event) => updateStation('loadingPoint', 'delivered', event.target.value)} /></label><label className="form-field"><span>Veränderung Unternehmer</span><output className="derived-value">{formatNumber(movementCalculation.loadingPoint.carrierChange, true)}</output></label></div></fieldset><fieldset><legend>Entladestelle</legend><div><label className="form-field"><span>Erhalten</span><input inputMode="numeric" min="0" step="1" type="number" value={movementForm.unloadingPoint.received} onChange={(event) => updateStation('unloadingPoint', 'received', event.target.value)} /></label><label className="form-field"><span>Abgegeben</span><input inputMode="numeric" min="0" step="1" type="number" value={movementForm.unloadingPoint.delivered} onChange={(event) => updateStation('unloadingPoint', 'delivered', event.target.value)} /></label><label className="form-field"><span>Veränderung Unternehmer</span><output className="derived-value">{formatNumber(movementCalculation.unloadingPoint.carrierChange, true)}</output></label></div></fieldset></div><section className="pallet-movement-impact"><h4>Auswirkung auf Palettenkonten</h4>{selectedCarrier && <div><span>Unternehmer</span><strong>{formatNumber(movementCalculation.carrierBalance, true)} Paletten</strong></div>}{selectedCustomer && <div><span>Kunde</span><strong>{formatNumber(movementCalculation.customerBalance, true)} Paletten</strong></div>}{!selectedCarrier && !selectedCustomer && <p>Wählen Sie mindestens einen beteiligten Geschäftspartner aus.</p>}</section>{formError && <p className="field-error">{formError}</p>}<div className="form-actions"><button className="button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Wird gespeichert …' : 'Bewegung speichern'}</button></div></form>}
      {activeForm === 'closing' && <form className="pallet-entry-form" onSubmit={handleClosingSubmit}><div className="pallet-entry-form__header"><h3>Abschluss hinzufügen</h3><button className="button button--secondary" type="button" onClick={() => setActiveForm('')}>Abbrechen</button></div><div className="pallet-entry-form__grid pallet-closing-form__grid"><label className="form-field"><span>Datum</span><input type="date" value={closingForm.date} onChange={(event) => setClosingForm({ ...closingForm, date: event.target.value })} /></label><label className="form-field"><span>Aktueller Saldo vor Abschluss</span><output className="derived-value">{formatNumber(account.balance, true)}</output></label><label className="form-field"><span>Abschlussbetrag / Saldoänderung</span><input autoFocus inputMode="decimal" type="number" step="0.01" value={closingForm.adjustment} onChange={(event) => setClosingForm({ ...closingForm, adjustment: event.target.value })} /></label><label className="form-field"><span>Neuer Saldo</span><output className="derived-value">{formatNumber(newClosingBalance, true)}</output></label><label className="form-field"><span>Grund / Art des Abschlusses</span><select value={closingForm.type} onChange={(event) => setClosingForm({ ...closingForm, type: event.target.value })}>{closingTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label><label className="form-field"><span>Referenz</span><input value={closingForm.reference} onChange={(event) => setClosingForm({ ...closingForm, reference: event.target.value })} /></label><label className="form-field pallet-entry-form__wide"><span>Bemerkung</span><input value={closingForm.note} onChange={(event) => setClosingForm({ ...closingForm, note: event.target.value })} /></label></div>{formError && <p className="field-error">{formError}</p>}<div className="form-actions"><button className="button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Wird gespeichert …' : 'Abschluss speichern'}</button></div></form>}
      <section className="pallet-journal"><div className="pallet-journal__header"><h3>Kontoliste</h3><span>{account.entries.length} Buchungen</span></div><div className="table-frame"><table><thead><tr><th>Datum</th><th>Art</th><th>Tour / Referenz</th><th>Gegenpartner</th><th>Stationen</th><th>Veränderung</th><th>Kontostand</th><th>Palettenschein</th><th>Bemerkung</th></tr></thead><tbody>{accountError ? <tr><td colSpan="9" className="table-state">Keine Palettenbuchungen verfügbar.</td></tr> : account.entries.length ? account.entries.map((entry) => { const counterparty = partnersById.get(entry.counterpartyId); return <tr className={entry.entryType === 'closing' ? 'pallet-journal__closing' : ''} key={`${entry.entryType}-${entry.id}`}><td>{formatDate(entry.date)}</td><td><span className={`pallet-entry-badge pallet-entry-badge--${entry.entryType}`}>{entry.entryType === 'closing' ? 'Abschluss' : 'Bewegung'}</span></td><td>{entry.entryType === 'closing' ? entry.reference || '—' : entry.tourNumber || '—'}</td><td>{entry.entryType === 'movement' ? counterparty?.companyName || '—' : entry.type}</td><td>{entry.entryType === 'movement' && entry.loadingPoint ? <details className="pallet-station-details"><summary>Details</summary><span>Ladestelle: E {entry.loadingPoint.received} · A {entry.loadingPoint.delivered}</span><span>Entladestelle: E {entry.unloadingPoint.received} · A {entry.unloadingPoint.delivered}</span></details> : '—'}</td><td>{formatNumber(entry.change, true)}</td><td><strong>{formatNumber(entry.balance, true)}</strong></td><td>{entry.entryType === 'movement' ? entry.palletReceiptNumber || '—' : '—'}</td><td>{entry.note || '—'}</td></tr> }) : <tr><td colSpan="9" className="table-state">Noch keine Palettenbuchungen vorhanden.</td></tr>}</tbody></table></div></section>
    </div>
  )
}
