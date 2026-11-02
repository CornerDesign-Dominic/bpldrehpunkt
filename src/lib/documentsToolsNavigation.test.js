import assert from 'node:assert/strict'
import test from 'node:test'
import { DOCUMENTS_TOOLS_PATH, documentsToolsModules, documentsToolsTabs, isDocumentsToolsPath } from './documentsToolsNavigation.js'
import { getPageTitle } from './pageTitles.js'

test('documents and tools has a separate overview and preserves existing section routes and rights', () => {
  assert.equal(DOCUMENTS_TOOLS_PATH, '/dokumente-werkzeuge')
  assert.equal(documentsToolsTabs[0].module, undefined)
  assert.deepEqual(documentsToolsTabs.slice(1).map(tab => tab.path), ['/feiertagskalender', '/dokumente', '/vorlagen', '/agb-pruefer'])
  assert.deepEqual(documentsToolsModules, ['feiertagskalender', 'documents', 'templates', 'agbChecker'])
  assert.equal(getPageTitle(DOCUMENTS_TOOLS_PATH), 'Dokumente & Werkzeuge')
  for (const tab of documentsToolsTabs.slice(1)) assert.equal(getPageTitle(tab.path), tab.de)
})

test('documents and tools remains active on template forms without matching lookalike routes', () => {
  for (const path of [...documentsToolsTabs.map(tab => tab.path), '/vorlagen/haftbarhaltung', '/vorlagen/geschaeftsdokument']) assert.equal(isDocumentsToolsPath(path), true)
  for (const path of ['/dokumente-werkzeuge-anders', '/dokumente-anders', '/vorlagen-anders', '/qualitaet', '/fallmanagement']) assert.equal(isDocumentsToolsPath(path), false)
})
