import assert from 'node:assert/strict'
import test from 'node:test'
import { assertLinkedTodoCreationContext, createAndRefreshLinkedTodo } from './linkedTodoRefresh.js'

test('confirmed save remains successful after refresh failure; retrying reads never repeats creation', async () => {
  let writes = 0
  let reads = 0
  const error = new Error('temporary read failure')
  const refresh = async () => { reads += 1; if (reads === 1) throw error }
  const result = await createAndRefreshLinkedTodo(async () => { writes += 1; return 'created-todo' }, refresh)
  assert.equal(result.id, 'created-todo')
  assert.equal(result.refreshError, error)
  await refresh()
  assert.equal(writes, 1)
  assert.equal(reads, 2)
})

test('failed creation propagates unchanged and does not refresh or report a saved ID', async () => {
  const error = new Error('save denied')
  let reads = 0
  await assert.rejects(createAndRefreshLinkedTodo(async () => { throw error }, async () => { reads += 1 }), (caught) => caught === error)
  assert.equal(reads, 0)
})

test('refresh starts only after creation is confirmed and returns the same ID', async () => {
  const actions = []
  const result = await createAndRefreshLinkedTodo(async () => { actions.push('created'); return 'source-bound-todo' }, async () => { actions.push('refreshed') })
  assert.deepEqual(actions, ['created', 'refreshed'])
  assert.deepEqual(result, { id: 'source-bound-todo', refreshError: null })
})

test('case navigation or an inconsistent fixed reference prevents creation before any write', async () => {
  let writes = 0
  for (const caseField of ['damageCaseId', 'inkassoCaseId', 'insolvencyId', 'legalDisputeId']) {
    for (const [values, current] of [[{ [caseField]: 'case-a' }, false], [{ [caseField]: 'case-b' }, true], [{}, true]]) {
      await assert.rejects(createAndRefreshLinkedTodo(async () => {
        assertLinkedTodoCreationContext(values, caseField, 'case-a', current)
        writes += 1
      }, async () => {}), { code: 'failed-precondition' })
    }
    assert.doesNotThrow(() => assertLinkedTodoCreationContext({ [caseField]: 'case-a' }, caseField, 'case-a', true))
  }
  assert.equal(writes, 0)
})
