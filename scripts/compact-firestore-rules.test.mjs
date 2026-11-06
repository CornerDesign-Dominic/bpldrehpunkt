import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { compactRulesSource } from './compact-firestore-rules.mjs'

test('rule compaction preserves quoted URLs, escapes and comment markers', () => {
  const source = `// comment\nlet url = 'https://example.invalid/a//b';\nlet marker = "/* keep */"; // remove\nlet escaped = 'can\\'t';`
  const compact = compactRulesSource(source)
  assert.ok(compact.includes("'https://example.invalid/a//b'"))
  assert.ok(compact.includes('"/* keep */"'))
  assert.ok(compact.includes("'can\\'t'"))
  assert.ok(!compact.includes('remove'))
})

test('comments remain token separators and path substitutions stay intact', () => {
  assert.equal(compactRulesSource('return/* comment */false;'), 'return false;')
  assert.equal(compactRulesSource('get(/databases/$(database)/documents/users/$(request.auth.uid))'), 'get(/databases/$(database)/documents/users/$(request.auth.uid))')
  assert.equal(compactRulesSource('allow read: if a & & b; / / * /'), 'allow read:if a& &b;/ / * /')
})

test('real rule compaction is idempotent and changes no non-comment token', () => {
  const source = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')
  const tokens = value => (value.match(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|[^\s]/g) || []).filter(token => !token.startsWith('//') && !token.startsWith('/*'))
  const compact = compactRulesSource(source)
  assert.deepEqual(tokens(compact), tokens(source))
  assert.equal(compactRulesSource(compact), compact)
})
