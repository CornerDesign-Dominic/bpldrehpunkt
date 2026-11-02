import assert from 'node:assert/strict'
import test from 'node:test'
import { CASE_MANAGEMENT_PATH, caseManagementModules, caseManagementTabs, isCaseManagementPath } from './caseManagementNavigation.js'
import { getPageTitle } from './pageTitles.js'

test('case overview has its own empty landing route and existing module addresses remain stable', () => {
  assert.equal(CASE_MANAGEMENT_PATH, '/fallmanagement')
  assert.equal(caseManagementTabs[0].path, CASE_MANAGEMENT_PATH)
  assert.equal(caseManagementTabs[0].module, undefined)
  assert.deepEqual(caseManagementTabs.slice(1).map(tab => tab.path), ['/schaeden', '/inkasso', '/legal-disputes', '/insolvenzen'])
  assert.deepEqual(caseManagementModules, ['damages', 'inkasso', 'legalDisputes', 'insolvencies'])
  assert.equal(getPageTitle(CASE_MANAGEMENT_PATH), 'Fallmanagement')
})

test('the single sidebar entry stays active on lists and direct case details without matching lookalike paths', () => {
  assert.equal(isCaseManagementPath(CASE_MANAGEMENT_PATH), true)
  for (const tab of caseManagementTabs.filter(tab => tab.module)) {
    assert.equal(isCaseManagementPath(tab.path), true)
    assert.equal(isCaseManagementPath(`${tab.path}/Fall%20mit%20ID`), true)
    assert.equal(isCaseManagementPath(`${tab.path}-anders`), false)
  }
  for (const path of ['/dashboard', '/fallmanagement-anders', '/fallmanagement/unbekannt', '/transportauftraege/1']) assert.equal(isCaseManagementPath(path), false)
})
