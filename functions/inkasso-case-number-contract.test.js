import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8')
const client = await readFile(new URL('../src/lib/inkasso.js', import.meta.url), 'utf8')
const callable = await readFile(new URL('./inkassoCases.js', import.meta.url), 'utf8')
const index = await readFile(new URL('./index.js', import.meta.url), 'utf8')

test('inkasso case numbers are issued exclusively by a callable transaction', () => {
  assert.match(rules, /match \/inkassoCases\/\{id\} \{[\s\S]*?allow create: if false;/)
  assert.match(rules, /match \/inkassoCaseCounters\/\{year\} \{\s*allow read, write: if false;/)
  assert.match(client, /httpsCallable\(functions, 'createInkassoCase'\)/)
  assert.match(index, /export \{ createInkassoCase \} from '\.\/inkassoCases\.js'/)
})

test('the callable uses one annual counter transaction and preserves existing yearly sequence numbers', () => {
  assert.match(callable, /onCall\(\{ region, enforceAppCheck: true \}/)
  assert.match(callable, /await database\.runTransaction/)
  assert.match(callable, /inkassoCaseCounters\/\$\{year\}/)
  assert.match(callable, /const caseNumber = `I-\$\{year\}-\$\{nextNumber\}`/)
  assert.match(callable, /highestIssuedNumber\(currentYearCases, year\)/)
  assert.match(callable, /profile\?\.role === 'superadmin' \|\| profile\?\.permissions\?\.inkasso === 'edit'/)
})
