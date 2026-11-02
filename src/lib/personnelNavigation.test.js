import assert from 'node:assert/strict'
import test from 'node:test'
import { HUMAN_RESOURCES_PATH, isPersonnelPath, personnelModules, personnelTabs } from './personnelNavigation.js'
import { getPageTitle } from './pageTitles.js'
import { canView } from './permissions.js'

test('human resources has its own overview while preserving personnel and detail routes', () => {
  assert.equal(HUMAN_RESOURCES_PATH, '/personalwesen')
  assert.deepEqual(personnelTabs.map(tab => tab.path), ['/personalwesen', '/personal'])
  assert.equal(personnelTabs[0].module, undefined)
  assert.equal(getPageTitle(HUMAN_RESOURCES_PATH), 'Personalwesen')
  assert.equal(getPageTitle('/personal/employee'), 'Personalverwaltung')
  for (const path of ['/personalwesen', '/personal', '/personal/employee']) assert.equal(isPersonnelPath(path), true)
  for (const path of ['/personalwesen-anders', '/personal-anders', '/urlaub', '/urlaubsmanagement', '/team']) assert.equal(isPersonnelPath(path), false)
})

test('human resources overview uses the existing personnel read permission without an admin override', () => {
  assert.deepEqual(personnelModules, ['personnel'])
  const allowed = profile => personnelModules.some(module => canView(profile, module))
  assert.equal(allowed({ role: 'user', active: true, permissions: { personnel: 'view' } }), true)
  assert.equal(allowed({ role: 'admin', active: true, permissions: {} }), false)
  assert.equal(allowed({ role: 'user', active: true, permissions: { personnel: 'none' } }), false)
})
