import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { db } from './firebase.js'

export const FLEET_VEHICLES_COLLECTION = 'fleetVehicles'
export const DISPATCH_TRIPS_COLLECTION = 'dispatchTrips'

export const VEHICLE_TYPES = ['Sattelzug', 'Tandemzug', 'Gliederzug', 'Transporter', 'Sonstiges']
export const VEHICLE_STATUSES = [
  { value: 'active', label: 'Aktiv' },
  { value: 'inactive', label: 'Inaktiv' },
  { value: 'blocked', label: 'Werkstatt / gesperrt' },
]
export const TRIP_STATUSES = [
  { value: 'planned', label: 'Geplant' },
  { value: 'confirmed', label: 'Bestätigt' },
  { value: 'en_route', label: 'Unterwegs' },
  { value: 'completed', label: 'Abgeschlossen' },
  { value: 'issue', label: 'Problem / Klärung' },
  { value: 'cancelled', label: 'Storniert' },
]

const fleetVehiclesRef = collection(db, FLEET_VEHICLES_COLLECTION)
const dispatchTripsRef = collection(db, DISPATCH_TRIPS_COLLECTION)
const trim = (value) => (value ?? '').trim()

function mapSnapshot(snapshot) {
  return { id: snapshot.id, ...snapshot.data() }
}

function vehiclePayload(values) {
  return {
    licensePlate: trim(values.licensePlate),
    vehicleType: values.vehicleType || VEHICLE_TYPES[0],
    ownerPartnerId: values.ownerPartnerId || null,
    status: values.status || 'active',
    note: trim(values.note),
  }
}

function tripPayload(values) {
  return {
    tourNumber: trim(values.tourNumber),
    vehicleId: values.vehicleId,
    startDateTime: `${values.startDate}T${values.startTime}`,
    endDateTime: `${values.endDate}T${values.endTime}`,
    origin: trim(values.origin),
    destination: trim(values.destination),
    status: values.status || 'planned',
    note: trim(values.note),
    driverName: trim(values.driverName),
    partnerId: values.partnerId || null,
  }
}

export function createEmptyVehicle() {
  return { licensePlate: '', vehicleType: VEHICLE_TYPES[0], ownerPartnerId: '', status: 'active', note: '' }
}

export function createEmptyTrip(vehicleId = '', date = toDateInputValue(new Date())) {
  return {
    tourNumber: '', vehicleId, startDate: date, startTime: '08:00', endDate: date, endTime: '16:00',
    origin: '', destination: '', status: 'planned', note: '', driverName: '', partnerId: '',
  }
}

export function tripToForm(trip) {
  return {
    tourNumber: trip.tourNumber || '', vehicleId: trip.vehicleId || '',
    startDate: datePart(trip.startDateTime), startTime: timePart(trip.startDateTime),
    endDate: datePart(trip.endDateTime), endTime: timePart(trip.endDateTime),
    origin: trip.origin || '', destination: trip.destination || '', status: trip.status || 'planned',
    note: trip.note || '', driverName: trip.driverName || '', partnerId: trip.partnerId || '',
  }
}

export function vehicleToForm(vehicle) {
  return {
    licensePlate: vehicle.licensePlate || '', vehicleType: vehicle.vehicleType || VEHICLE_TYPES[0],
    ownerPartnerId: vehicle.ownerPartnerId || '', status: vehicle.status || 'active', note: vehicle.note || '',
  }
}

export function toDateInputValue(value) {
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

export function startOfDay(value) {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

export function addDays(value, days) {
  const date = startOfDay(value)
  date.setDate(date.getDate() + days)
  return date
}

export function getTripStatusLabel(status) {
  return TRIP_STATUSES.find((item) => item.value === status)?.label || 'Geplant'
}

export function getVehicleStatusLabel(status) {
  return VEHICLE_STATUSES.find((item) => item.value === status)?.label || '—'
}

export async function listFleetVehicles() {
  const snapshot = await getDocs(fleetVehiclesRef)
  return snapshot.docs.map(mapSnapshot).sort((left, right) => left.licensePlate.localeCompare(right.licensePlate, 'de'))
}

export async function listDispatchTrips() {
  const snapshot = await getDocs(dispatchTripsRef)
  return snapshot.docs.map(mapSnapshot).sort((left, right) => new Date(left.startDateTime) - new Date(right.startDateTime))
}

export async function createFleetVehicle(values) {
  const vehicleRef = doc(fleetVehiclesRef)
  await setDoc(vehicleRef, { id: vehicleRef.id, ...vehiclePayload(values), createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  return vehicleRef.id
}

export async function updateFleetVehicle(vehicleId, values) {
  await updateDoc(doc(db, FLEET_VEHICLES_COLLECTION, vehicleId), { ...vehiclePayload(values), updatedAt: serverTimestamp() })
}

export async function createDispatchTrip(values) {
  const tripRef = doc(dispatchTripsRef)
  await setDoc(tripRef, { id: tripRef.id, ...tripPayload(values), createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  return tripRef.id
}

export async function updateDispatchTrip(tripId, values) {
  await updateDoc(doc(db, DISPATCH_TRIPS_COLLECTION, tripId), { ...tripPayload(values), updatedAt: serverTimestamp() })
}

export function isTripRangeValid(values) {
  return Boolean(values.vehicleId && values.tourNumber.trim() && values.startDate && values.startTime && values.endDate && values.endTime)
    && new Date(`${values.endDate}T${values.endTime}`) > new Date(`${values.startDate}T${values.startTime}`)
}

export function assignTripLanes(trips) {
  const laneEnds = [null, null]
  return [...trips]
    .sort((left, right) => new Date(left.startDateTime) - new Date(right.startDateTime) || new Date(left.endDateTime) - new Date(right.endDateTime))
    .map((trip) => {
      const start = new Date(trip.startDateTime).getTime()
      const lane = laneEnds[0] === null || laneEnds[0] <= start ? 0 : laneEnds[1] === null || laneEnds[1] <= start ? 1 : null
      if (lane !== null) laneEnds[lane] = new Date(trip.endDateTime).getTime()
      return { ...trip, lane, isConflict: lane === null }
    })
}

export function datePart(value) {
  return (value || '').slice(0, 10)
}

export function timePart(value) {
  return (value || '').slice(11, 16)
}
