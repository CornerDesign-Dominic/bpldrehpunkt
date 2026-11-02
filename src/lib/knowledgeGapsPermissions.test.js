import test from 'node:test'
import assert from 'node:assert/strict'
import { MODULES, normalizePermissions, canView, canEdit } from './permissions.js'

test('knowledge gap permissions are explicit and never inherited from handbook access', () => {
  assert.equal(MODULES.knowledgeGaps.label, 'Wissenslücken')
  assert.equal(normalizePermissions({ handbook: 'edit' }).knowledgeGaps, 'none')
  const reader = { role: 'user', permissions: { handbook: 'edit' } }
  assert.equal(canView(reader, 'knowledgeGaps'), false)
  const curator = { role: 'user', permissions: { knowledgeGaps: 'edit' } }
  assert.equal(canEdit(curator, 'knowledgeGaps'), true)
  assert.equal(canView(curator, 'handbook'), false)
  assert.equal(canEdit({ role: 'admin', permissions: {} }, 'knowledgeGaps'), false)
  assert.equal(canEdit({ role: 'superadmin' }, 'knowledgeGaps'), true)
})
