import assert from 'node:assert/strict'
import test from 'node:test'
import { QUALITY_PATH, isQualityPath, qualityModules, qualityTabs } from './qualityNavigation.js'
import { getPageTitle } from './pageTitles.js'

test('quality overview precedes the existing four sections and preserves their titles and permissions', () => {
  assert.equal(QUALITY_PATH, '/qualitaet')
  assert.equal(qualityTabs[0].path, QUALITY_PATH)
  assert.equal(qualityTabs[0].module, undefined)
  assert.deepEqual(qualityTabs.slice(1).map(tab => tab.path), ['/qualitaet/kvp', '/qualitaet/handbuch', '/qualitaet/grundregeln', '/qualitaet/wissensluecken'])
  assert.deepEqual(qualityModules, ['kvp', 'handbook', 'knowledgeGaps'])
  assert.equal(getPageTitle(QUALITY_PATH), 'Qualität')
  for (const tab of qualityTabs.slice(1)) assert.equal(getPageTitle(`${tab.path}/beispiel`), tab.de)
})

test('quality menu stays active on article, rule and PDCA details without matching unrelated paths', () => {
  for (const path of ['/qualitaet', '/qualitaet/kvp', '/qualitaet/kvp/thema', '/qualitaet/kvp/besprechungen/1', '/qualitaet/handbuch/artikel', '/qualitaet/grundregeln/regel', '/qualitaet/wissensluecken']) assert.equal(isQualityPath(path), true)
  for (const path of ['/qualitaet-anders', '/qualitaet/handbuch-anders', '/qualitaet/unbekannt', '/fallmanagement', '/schaeden/1']) assert.equal(isQualityPath(path), false)
})
