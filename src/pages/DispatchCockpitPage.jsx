import { useEffect, useMemo, useState } from 'react'
import DispatchMatrix from '../components/dispatch/DispatchMatrix.jsx'
import DispatchTripForm from '../components/dispatch/DispatchTripForm.jsx'
import FleetVehicleManager from '../components/dispatch/FleetVehicleManager.jsx'
import Toast from '../components/ui/Toast.jsx'
import {
  addDays,
  createDispatchTrip,
  createFleetVehicle,
  listDispatchTrips,
  listFleetVehicles,
  startOfDay,
  updateDispatchTrip,
  updateFleetVehicle,
} from '../lib/dispatchCockpit.js'
import { listBusinessPartners } from '../lib/businessPartners.js'

function formatPeriod(start, dayCount) {
  const end = addDays(start, dayCount - 1)
  const formatter = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })
  return dayCount === 1 ? formatter.format(start) : `${formatter.format(start)} – ${formatter.format(end)}`
}

export default function DispatchCockpitPage() {
  const [vehicles, setVehicles] = useState([])
  const [trips, setTrips] = useState([])
  const [partners, setPartners] = useState([])
  const [periodStart, setPeriodStart] = useState(() => startOfDay(new Date()))
  const [dayCount, setDayCount] = useState(3)
  const [editingTrip, setEditingTrip] = useState(undefined)
  const [showVehicleManager, setShowVehicleManager] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  async function reloadData() {
    const [loadedVehicles, loadedTrips, loadedPartners] = await Promise.all([listFleetVehicles(), listDispatchTrips(), listBusinessPartners()])
    setVehicles(loadedVehicles); setTrips(loadedTrips); setPartners(loadedPartners)
  }

  useEffect(() => {
    let current = true
    Promise.all([listFleetVehicles(), listDispatchTrips(), listBusinessPartners()])
      .then(([loadedVehicles, loadedTrips, loadedPartners]) => { if (current) { setVehicles(loadedVehicles); setTrips(loadedTrips); setPartners(loadedPartners) } })
      .catch(() => { if (current) setError('Das Dispo-Cockpit konnte nicht geladen werden. Bitte Firestore-Zugriff und Verbindung prüfen.') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [])

  const selectedTrip = useMemo(() => editingTrip && editingTrip !== 'new' ? editingTrip : null, [editingTrip])

  async function saveTrip(values) {
    try {
      if (selectedTrip) await updateDispatchTrip(selectedTrip.id, values)
      else await createDispatchTrip(values)
      await reloadData()
      setEditingTrip(undefined)
      setToast(selectedTrip ? 'Transport aktualisiert.' : 'Transport angelegt.')
    } catch (saveError) {
      setError('Die Tour konnte nicht gespeichert werden.')
      throw saveError
    }
  }

  async function saveVehicle(vehicleId, values) {
    try {
      if (vehicleId) await updateFleetVehicle(vehicleId, values)
      else await createFleetVehicle(values)
      await reloadData()
      setToast(vehicleId ? 'Fahrzeug aktualisiert.' : 'Fahrzeug angelegt.')
    } catch (saveError) {
      setError('Das Fahrzeug konnte nicht gespeichert werden.')
      throw saveError
    }
  }

  return <div className="dispatch-page">
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    <div className="dispatch-toolbar">
      <div className="dispatch-toolbar__period"><button className="button button--secondary" type="button" onClick={() => setPeriodStart((current) => addDays(current, -dayCount))}>←</button><button className="button button--secondary" type="button" onClick={() => setPeriodStart(startOfDay(new Date()))}>Heute</button><button className="button button--secondary" type="button" onClick={() => setPeriodStart((current) => addDays(current, dayCount))}>→</button><strong>{formatPeriod(periodStart, dayCount)}</strong></div>
      <div className="dispatch-toolbar__actions"><label className="filter-field"><span className="sr-only">Zeitraum</span><select value={dayCount} onChange={(event) => setDayCount(Number(event.target.value))}><option value="1">1 Tag</option><option value="3">3 Tage</option><option value="7">7 Tage</option></select></label><button className="button button--secondary" type="button" onClick={() => setShowVehicleManager((visible) => !visible)}>Fahrzeuge verwalten</button><button className="button" type="button" disabled={!vehicles.length} onClick={() => setEditingTrip('new')}>Transport hinzufügen</button></div>
    </div>
    {!vehicles.length && !loading && <p className="dispatch-hint">Legen Sie zuerst ein Fahrzeug an, um einen Transport einzuplanen.</p>}
    {editingTrip && <DispatchTripForm key={selectedTrip?.id || `new-${vehicles.length}`} trip={selectedTrip} vehicles={vehicles} partners={partners} onCancel={() => setEditingTrip(undefined)} onSubmit={saveTrip} />}
    {showVehicleManager && <FleetVehicleManager vehicles={vehicles} partners={partners} onClose={() => setShowVehicleManager(false)} onCreate={(values) => saveVehicle(null, values)} onUpdate={saveVehicle} />}
    {error && <p className="form-error">{error}</p>}
    {loading ? <p className="page-state">Dispo-Cockpit wird geladen …</p> : <DispatchMatrix vehicles={vehicles} trips={trips} partners={partners} periodStart={periodStart} dayCount={dayCount} onEditTrip={setEditingTrip} />}
    <p className="dispatch-legend"><span className="dispatch-legend__item dispatch-legend__item--planned">Geplant</span><span className="dispatch-legend__item dispatch-legend__item--confirmed">Bestätigt</span><span className="dispatch-legend__item dispatch-legend__item--en-route">Unterwegs</span><span className="dispatch-legend__item dispatch-legend__item--completed">Abgeschlossen</span><span className="dispatch-legend__item dispatch-legend__item--issue">Problem / Klärung</span><span className="dispatch-legend__item dispatch-legend__item--cancelled">Storniert</span><span className="dispatch-legend__item dispatch-legend__item--conflict">Planungskonflikt</span></p>
  </div>
}
