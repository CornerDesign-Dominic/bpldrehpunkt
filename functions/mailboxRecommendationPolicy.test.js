import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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
