import assert from 'node:assert/strict'
import test from 'node:test'
import { createMemoryRouter } from 'react-router-dom'
import { businessPartnerArchivePath, businessPartnerDetailPath, isBusinessPartnerArchive } from './businessPartnerLinks.js'
import { assertCurrentPartnerReference, resolvePartnerReference, partnerReferenceVersion } from './partnerReference.js'
import { createReturnState, resolveReturnNavigation } from './recordNavigation.js'

const routes = [{ path: '/schaeden/:id' }, { path: '/kunden-unternehmer/stammdaten/:partnerId' }]

test('the same normal link resolves current merges on open/reload and returns to its origin after separation', async () => {
  const source = { id: 'A%20#?', companyName: 'Ursprung', status: 'active' }
  const target = { id: 'B', companyName: 'Ziel', status: 'active' }
  const records = new Map([[source.id, source], [target.id, target]])
  const read = async (id) => records.get(id) || null
  const path = businessPartnerDetailPath(source.id)
  const router = createMemoryRouter(routes, { initialEntries: ['/schaeden/fall'] })
  const state = createReturnState(router.state.location)
  await router.navigate(path, { state })
  const load = () => resolvePartnerReference(router.state.matches.at(-1).params.partnerId, read, { archive: isBusinessPartnerArchive(router.state.location.search) })
  assert.equal((await load()).id, source.id)
  records.set(source.id, { ...source, status: 'merged', mergedIntoPartnerId: target.id })
  assert.equal((await load()).id, target.id)
  assert.equal(router.state.location.pathname, path)
  // A new tab has only its href, without React navigation state.
  const newTab = createMemoryRouter(routes, { initialEntries: [path] })
  assert.equal((await resolvePartnerReference(newTab.state.matches.at(-1).params.partnerId, read)).id, target.id)
  newTab.dispose()
  assert.equal(resolveReturnNavigation(router.state.location.state, '/kunden-unternehmer').to, '/schaeden/fall')
  await router.navigate(-1)
  await router.navigate(1)
  records.set(source.id, source)
  assert.equal((await load()).id, source.id)
  router.dispose()
})

test('archive access is explicit, retains exact IDs and never follows a redirect', async () => {
  const id = '100% Logistik#?'
  const source = { id, status: 'merged', mergedIntoPartnerId: 'target' }
  const calls = []
  const router = createMemoryRouter(routes, { initialEntries: [businessPartnerArchivePath(id)] })
  assert.equal(router.state.matches.at(-1).params.partnerId, id)
  assert.equal(isBusinessPartnerArchive(router.state.location.search), true)
  const result = await resolvePartnerReference(id, async (key) => { calls.push(key); return source }, { archive: true })
  assert.equal(result, source)
  assert.deepEqual(calls, [id])
  assert.equal(isBusinessPartnerArchive('?archiv=0'), false)
  router.dispose()
})

test('normal resolution supports historical chains but fails on missing/cyclic targets and read denial', async () => {
  const map = new Map([['a', { id: 'a', mergedIntoPartnerId: 'b' }], ['b', { id: 'b', mergedIntoPartnerId: 'c' }], ['c', { id: 'c', status: 'active' }]])
  const read = async (id) => map.get(id) || null
  assert.equal((await resolvePartnerReference('a', read)).id, 'c')
  map.set('c', { id: 'c', mergedIntoPartnerId: 'a' })
  await assert.rejects(resolvePartnerReference('a', read), /Zyklische/)
  map.delete('b')
  await assert.rejects(resolvePartnerReference('a', read), /nicht vorhanden/)
  const denied = Object.assign(new Error('denied'), { code: 'permission-denied' })
  await assert.rejects(resolvePartnerReference('a', async () => { throw denied }), (error) => error === denied)
  assert.equal(await resolvePartnerReference('', read), null)
})

test('reference versions detect a changed target or merge state, including another edit within the same second', () => {
  const original = { id: 'a', status: 'active', updatedAt: { seconds: 123, nanoseconds: 1 } }
  assert.equal(partnerReferenceVersion(original), partnerReferenceVersion(structuredClone(original)))
  for (const patch of [{ id: 'b' }, { latestMergeId: 'merge' }, { status: 'merged', mergedIntoPartnerId: 'b' }, { updatedAt: { seconds: 123, nanoseconds: 2 } }]) assert.notEqual(partnerReferenceVersion(original), partnerReferenceVersion({ ...original, ...patch }))
  assert.notEqual(partnerReferenceVersion(original), partnerReferenceVersion(null))
})

test('a write requires the intended current partner and exact confirmed version', () => {
  const partner = { id: 'b', status: 'active', updatedAt: { seconds: 123, nanoseconds: 1 } }
  const version = partnerReferenceVersion(partner)
  assert.doesNotThrow(() => assertCurrentPartnerReference(partner, 'b', version))
  for (const current of [null, { ...partner, id: 'a' }, { ...partner, mergedIntoPartnerId: 'c' }, { ...partner, status: 'merged' }, { ...partner, updatedAt: { seconds: 123, nanoseconds: 2 } }]) {
    assert.throws(() => assertCurrentPartnerReference(current, 'b', version), { code: 'failed-precondition' })
  }
})
