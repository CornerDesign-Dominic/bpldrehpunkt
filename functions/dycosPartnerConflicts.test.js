import assert from 'node:assert/strict'
import test from 'node:test'
import { dycosConflictRows, retainedDycosResolutions } from './shared/dycosPartnerConflicts.js'

test('kept comparisons survive another import, but changed source/manual values reappear', () => {
  const conflict = { path: 'companyName', label: 'Firmenname', incomingValue: 'Quelle' }
  const partner = { companyName: 'Manuell', dycosImport: { conflicts: [conflict], resolutions: [{ path: 'companyName', currentValue: 'Manuell', incomingValue: 'Quelle', decision: 'keep' }] } }
  assert.deepEqual(dycosConflictRows(partner), [])
  assert.equal(retainedDycosResolutions(partner, [conflict]).length, 1)
  assert.equal(retainedDycosResolutions(partner, []).length, 1)
  assert.equal(dycosConflictRows(partner, [{ ...conflict, incomingValue: 'Neu' }]).length, 1)
  assert.equal(dycosConflictRows({ ...partner, companyName: 'Andere Eingabe' }).length, 1)
  assert.equal(dycosConflictRows({ ...partner, companyName: 'Quelle' }).length, 0)
})

test('contact comparisons follow identities after reorder; fallback payment terms and false remain populated', () => {
  const partner = { paymentTermsOriginal: '30 Tage', creditNoteProcedure: false, contacts: [{ id: 'b', phone: 'B' }, { id: 'a', phone: 'Alt' }], dycosImport: { conflicts: [
    { path: 'contacts.0.phone', label: 'Ansprechpartner', contactId: 'a', incomingValue: 'Neu' },
    { path: 'paymentTermDays', label: 'Zahlungsziel', incomingValue: '60 Tage' },
    { path: 'creditNoteProcedure', label: 'Gutschriftverfahren', incomingValue: true },
  ] } }
  const rows = dycosConflictRows(partner)
  assert.equal(rows[0].path, 'contacts.1.phone'); assert.equal(rows[0].currentValue, 'Alt')
  assert.equal(rows[1].currentValue, '30 Tage'); assert.equal(rows[2].currentValue, false)
  partner.dycosImport.resolutions = [{ path: 'contacts.5.phone', contactId: 'a', incomingValue: 'Neu', currentValue: 'Alt', decision: 'keep' }]
  assert.equal(dycosConflictRows(partner).length, 2)
  assert.equal(retainedDycosResolutions(partner, partner.dycosImport.conflicts).length, 1)
})

