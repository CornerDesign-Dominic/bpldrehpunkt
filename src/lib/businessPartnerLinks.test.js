import assert from 'node:assert/strict'
import test from 'node:test'
import { businessPartnerDetailPath } from './businessPartnerLinks.js'

test('partner detail links preserve URL-encoded Firestore document IDs', () => {
  const partnerId = 'dycos-carrier-Stefanov%20EOOD%20Silistra%2C%20Bulgaria'
  const path = businessPartnerDetailPath(partnerId)
  assert.equal(path, '/kunden-unternehmer/dycos-carrier-Stefanov%2520EOOD%2520Silistra%252C%2520Bulgaria')
  assert.equal(decodeURIComponent(path.split('/').at(-1)), partnerId)
})
