const labels = {
  companyName: 'Firmenname', debtorNumber: 'Debitorennummer', creditorNumber: 'Kreditorennummer',
  timocomNumber: 'TIMOCOM-Nummer', transeuNumber: 'Trans.eu-Nummer', dplNumber: 'DPL-Nummer', pakiNumber: 'Paki-Nummer',
  status: 'Status', paymentTermDays: 'Zahlungsziel', creditNoteProcedure: 'Gutschriftverfahren', creditLimit: 'Kreditlimit',
  palletNote: 'Palettenbemerkung', crmStatus: 'CRM-Status', crmIndustry: 'Branche', potential: 'Potenzial', language: 'Sprache', dycosCreatedAt: 'Erfasst am DyCoS',
  address: 'Adresse', street: 'Straße', houseNumber: 'Hausnummer', postalCode: 'PLZ', city: 'Ort', country: 'Land',
  contact: 'Allgemeiner Kontakt', phone: 'Telefon', fax: 'Fax', email: 'E-Mail', website: 'Webseite',
  companyData: 'Unternehmensdaten', vatId: 'USt-IdNr.', taxNumber: 'Steuernummer', commercialRegisterNumber: 'Handelsregisternummer', registerCourt: 'Registergericht',
  bankData: 'Abrechnung', iban: 'IBAN', bic: 'BIC', ibanVerifiedAt: 'IBAN geprüft am',
  contacts: 'Ansprechpartner', name: 'Name', department: 'Abteilung', departmentOther: 'Weitere Abteilung', mobile: 'Mobil',
  portals: 'Portal', url: 'URL', username: 'Benutzername', purpose: 'Zweck', accessNumber: 'Zugangsdaten', password: 'Zugangsdaten',
  customer: 'Kunde', carrier: 'Unternehmer', enabledRuleIds: 'Automatische Regel', licensePlateImportant: 'Kennzeichen erforderlich', loadingSiteInformationImportant: 'Ladestelleninformationen erforderlich', actualArrivalConfirmationEnabled: 'Tatsächliche Ankunft bestätigen',
  businessPartnerRoles: 'Partnerrollen', linkedCarrierReference: 'Zugeordneter Unternehmer', shipmentTrackingPolicy: 'Sendungsverfolgung-Einstellungen',
}
const roots = ['companyName', 'debtorNumber', 'creditorNumber', 'timocomNumber', 'transeuNumber', 'dplNumber', 'pakiNumber', 'status', 'paymentTermDays', 'creditNoteProcedure', 'creditLimit', 'palletNote', 'crmStatus', 'crmIndustry', 'potential', 'language', 'dycosCreatedAt', 'address', 'contact', 'companyData', 'bankData', 'contacts', 'portals', 'businessPartnerRoles', 'linkedCarrierReference', 'shipmentTrackingPolicy']
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const normalized = (value) => value === undefined || value === null || value === '' ? null : value
const equal = (a, b) => JSON.stringify(normalized(a)) === JSON.stringify(normalized(b))

export function mergePartnerHistoryPatch(previous, patch) {
  const next = { ...previous }
  for (const [key, value] of Object.entries(patch || {})) next[key] = object(value) ? mergePartnerHistoryPatch(object(previous?.[key]) ? previous[key] : {}, value) : value
  return next
}

export function partnerHistoryFieldLabel(path) {
  return path.split('.').map((key) => labels[key] || key).join(' · ')
}

function category(root) {
  if (root === 'creditLimit') return 'creditLimit'
  if (['crmStatus', 'crmIndustry', 'potential'].includes(root)) return 'crm'
  if (root === 'contacts') return 'contactPerson'
  if (['paymentTermDays', 'creditNoteProcedure', 'bankData'].includes(root)) return 'paymentData'
  if (root === 'shipmentTrackingPolicy') return 'shipmentTrackingPolicy'
  return 'masterData'
}

export function businessPartnerHistoryChanges(previous = {}, next = {}) {
  const changes = []
  function visit(before, after, path, label) {
    if (equal(before, after)) return
    const root = path.split('.')[0]
    // Never duplicate portal credentials into the history collection.
    if (/\.(accessNumber|password)$/.test(path)) {
      changes.push({ path, label, category: category(root), oldValue: normalized(before) === null ? null : 'Geschützt', newValue: normalized(after) === null ? null : 'Geschützt' })
      return
    }
    if (['contacts', 'portals'].includes(root) && path === root) {
      const beforeRows = Array.isArray(before) ? before : []
      const afterRows = Array.isArray(after) ? after : []
      const keyed = (rows) => new Map(rows.map((row, index) => [row.id || String(index), row]))
      const left = keyed(beforeRows); const right = keyed(afterRows)
      for (const id of new Set([...left.keys(), ...right.keys()])) {
        const a = left.get(id) || {}; const b = right.get(id) || {}
        const fields = root === 'contacts' ? ['name', 'department', 'departmentOther', 'phone', 'mobile', 'email'] : ['name', 'url', 'username', 'purpose', 'accessNumber', 'password']
        const title = `${labels[root]} · ${b.name || a.name || b.email || a.email || id}`
        for (const field of fields) visit(a[field], b[field], `${root}.${id}.${field}`, `${title} · ${labels[field]}`)
      }
      return
    }
    if (object(before) || object(after)) {
      const keys = new Set([...Object.keys(object(before) ? before : {}), ...Object.keys(object(after) ? after : {})])
      for (const key of keys) visit(before?.[key], after?.[key], `${path}.${key}`, `${label} · ${labels[key] || key}`)
      return
    }
    changes.push({ path, label, category: category(root), oldValue: normalized(before), newValue: normalized(after) })
  }
  // Missing root fields in a partial update are not deletions.
  for (const root of roots) if (Object.hasOwn(next, root)) visit(previous[root], next[root], root, labels[root])
  return changes
}
