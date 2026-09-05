function currentDate() {
  const today = new Date()
  const offset = today.getTimezoneOffset() * 60_000
  return new Date(today.getTime() - offset).toISOString().slice(0, 10)
}

// This is the only variable data source used by the form and the document.
// Future AI extraction writes this object as well; signature and stamp data can
// be added to the `attachments` branch without changing letter field names.
export function createLiabilityDocumentData() {
  return {
    orderNumber: '',
    transportCompany: '',
    transportStreet: '',
    transportZip: '',
    transportCity: '',
    transportCountry: '',
    loadingCompany: '',
    loadingStreet: '',
    loadingZip: '',
    loadingCity: '',
    loadingCountry: '',
    loadingDate: '',
    unloadingCompany: '',
    unloadingStreet: '',
    unloadingZip: '',
    unloadingCity: '',
    unloadingCountry: '',
    unloadingDate: '',
    date: currentDate(),
    incidentText: '',
    attachments: {
      signature: null,
      stamp: null,
    },
  }
}

// Temporary extraction data follows the exact same shape as documentData.
// A future AI service can replace this factory without changing either form
// or the live document preview.
export function createMockLiabilityAiDraftData() {
  return {
    ...createLiabilityDocumentData(),
    orderNumber: '260600789',
    transportCompany: 'Muster Transporte GmbH',
    transportStreet: 'Musterstraße 10',
    transportZip: '45128',
    transportCity: 'Essen',
    transportCountry: 'Deutschland',
    loadingCompany: 'Brennpunkt Logistik GmbH',
    loadingStreet: 'Reinshagenstr. 1',
    loadingZip: '42369',
    loadingCity: 'Wuppertal',
    loadingCountry: 'Deutschland',
    loadingDate: '2026-08-25',
    unloadingCompany: 'Beispiel Kunde GmbH',
    unloadingStreet: 'Industriestraße 22',
    unloadingZip: '50667',
    unloadingCity: 'Köln',
    unloadingCountry: 'Deutschland',
    unloadingDate: '2026-08-27',
    incidentText: 'Aufgrund der verspäteten Bereitstellung des Fahrzeugs kam es zu erheblichen Verzögerungen im Transportablauf. Hieraus entstanden zusätzliche Aufwendungen und mögliche Folgekosten.',
  }
}

export function getLiabilitySubject(orderNumber) {
  return `Haftbarhaltung zum Transportauftrag${orderNumber ? ` ${orderNumber}` : ''}`
}

export function formatDocumentDate(value) {
  if (!value) return ''
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
}
