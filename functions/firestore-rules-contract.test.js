import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8')

test('active superadmins retain elevated rights while disabled superadmins do not', () => {
  assert.match(rules, /function superadmin\(\) \{ return active\(\) && role\(\) == 'superadmin'; \}/)
  assert.match(rules, /function admin\(\) \{ return active\(\) && \(role\(\) == 'admin' \|\| superadmin\(\)\); \}/)
})
