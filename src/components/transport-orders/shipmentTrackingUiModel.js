export const trackingStages = [
  { id: 'preparation', label: 'Vorbereitung', subtitle: 'Kennzeichen · Anmeldung' },
  { id: 'loading', label: 'Ladestelle', subtitle: 'Ankunft · Beladung · Abfahrt' },
  { id: 'in_transit', label: 'Unterwegs', subtitle: 'Fahrt · ETA' },
  { id: 'unloading', label: 'Entladestelle', subtitle: 'Ankunft · Entladung' },
  { id: 'afterTransport', label: 'Nachtransport', subtitle: 'Nachweise · Abschluss' },
]

export const trackingStatusLabels = {
  neutral: 'Sendungsverfolgung noch nicht gestartet',
  pending: 'Rückmeldung oder Aktion offen',
  confirmed: 'Rückmeldung bestätigt',
  overdue: 'Eskalation erforderlich',
  manual: 'Manuelles Tracking aktiv',
}

/**
 * Lokales Anzeige-Modell für die spätere Tracking-Anbindung.
 * Die Werte werden bewusst nicht gespeichert oder aus Firestore gelesen.
 */
export const defaultShipmentTrackingUiModel = Object.freeze({
  status: 'neutral',
  statusLabel: 'Sendungsverfolgung noch nicht gestartet',
  lifecycleStatus: 'upcoming',
  lifecycleLabel: 'Bevorstehend',
  trackingTypeLabel: 'Manuell',
  vehiclePosition: { stageId: 'preparation', progressToNextStage: 0 },
  hints: [],
  nextAction: null,
  futureTrackingFields: {
    licensePlate: undefined,
    loadingArrivalExpected: undefined,
    loadingArrivalActual: undefined,
    loadingStartedAt: undefined,
    loadingCompletedAt: undefined,
    loadingDepartureActual: undefined,
    unloadingArrivalExpected: undefined,
    unloadingArrivalActual: undefined,
    unloadingStartedAt: undefined,
    unloadingCompletedAt: undefined,
    completionProofs: undefined,
  },
})
