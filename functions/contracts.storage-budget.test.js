import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('contract Storage rule dependency closure uses exactly the permitted two Firestore documents', () => {
  const source = readFileSync(new URL('../storage.rules', import.meta.url), 'utf8')
  const helpers = new Map([...source.matchAll(/function (\w+)\([^)]*\)\s*\{([^}]+)\}/g)].map((match) => [match[1], match[2]]))
  const block = source.match(/match \/contracts\/\{contractId\}\/documents\/\{fileName\} \{([\s\S]*?)\n {4}\}/)?.[1]
  assert.ok(block)
  const visited = new Set()
  const paths = new Set()
  function inspect(body) {
    for (const call of body.matchAll(/\b(\w+)\(/g)) {
      if (helpers.has(call[1]) && !visited.has(call[1])) {
        visited.add(call[1]); inspect(helpers.get(call[1]))
      }
    }
    for (const call of body.matchAll(/firestore\.(?:get|exists)\(/g)) {
      const start = call.index + call[0].length
      let depth = 1
      let end = start
      for (; end < body.length; end += 1) {
        if (body[end] === '(') depth += 1
        else if (body[end] === ')') depth -= 1
        if (depth === 0) break
      }
      paths.add(body.slice(start, end))
    }
  }
  inspect(block)
  assert.deepEqual([...paths].sort(), ['/databases/(default)/documents/contracts/$(contractId)', '/databases/(default)/documents/users/$(request.auth.uid)'])
  assert.ok(visited.has('contractStorageAccess'))
  assert.doesNotMatch(helpers.get('contractStorageAccess'), /\/documents\/\$\(fileName/)
  assert.match(block, /resource == null/)
})
