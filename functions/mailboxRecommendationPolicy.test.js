import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { FUNCTIONAL_MAILBOXES, isFunctionalMailbox, isManagedRecommendationMailbox } from './mailboxRecommendationPolicy.js'
import { recommendationScope } from './mailboxRecommendations.js'

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8')
test('recorded product decision prohibits both mailbox recovery polling and a recommendation polling timer', () => {
  const backend = read('./mailboxRecommendations.js'), adapter = read('./mailboxes.js'), index = read('./index.js'), hook = read('../src/mailboxes/useMailboxRecommendations.js')
  assert.doesNotMatch(backend, /readRecommendationInbox|messages\/delta|mailFolders\/inbox\/messages/)
  assert.doesNotMatch(index, /export const enqueueMailboxRecommendations/)
  assert.doesNotMatch(adapter, /readRecommendationInbox/)
  assert.doesNotMatch(hook, /setInterval/)
  assert.match(hook, /onSnapshot/)
  assert.match(read('../docs/decisions/mailbox-recommendations-no-polling.md'), /Keine regelmäßige Postfachabfrage/)
})

test('only the five designated addresses are functional mailboxes, regardless of connection route', () => {
  assert.equal(FUNCTIONAL_MAILBOXES.length, 5)
  for (const email of FUNCTIONAL_MAILBOXES) {
    assert.equal(isFunctionalMailbox(email.toUpperCase()), true)
    assert.equal(isManagedRecommendationMailbox({ email, kind: 'personal' }), true)
  }
  for (const email of ['bb@brennpunkt-logistik.de', 'rechnung@other.example', 'my-rechnung@brennpunkt-logistik.de', '', null]) assert.equal(isManagedRecommendationMailbox({ email, kind: 'personal' }), false)
  assert.equal(isManagedRecommendationMailbox({ email: 'other@company.example', kind: 'shared' }), true)
})

test('functional direct sign-ins and delegated connections share one scope; genuine personal ownership remains separate', () => {
  const direct = { tenantId: 'tenant', email: FUNCTIONAL_MAILBOXES[0], kind: 'personal', graphUserId: 'user-id', canonicalMailboxId: 'same-folder', ownerId: 'one' }
  const delegated = { ...direct, kind: 'shared', ownerId: 'two', graphUserId: direct.email }
  assert.equal(recommendationScope(direct), recommendationScope(delegated))
  assert.equal(recommendationScope(direct), recommendationScope({ ...direct, ownerId: 'three' }))
  assert.notEqual(recommendationScope(direct), recommendationScope({ ...direct, tenantId: 'other' }))
  assert.throws(() => recommendationScope({ ...direct, canonicalMailboxId: undefined }))
  const personal = { ...direct, email: 'bb@brennpunkt-logistik.de' }
  assert.notEqual(recommendationScope(personal), recommendationScope({ ...personal, ownerId: 'two' }))
})
