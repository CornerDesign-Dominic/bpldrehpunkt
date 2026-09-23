import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { getPageTitle } from './pageTitles.js'
import { formatReleaseDate, isProductionReleaseTarget, releaseNotes, visibleReleaseNotes } from './releaseNotes.js'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('production shows only published releases; dev previews 1.1.0 ahead of tagged 1.0.0', () => {
  assert.equal(isProductionReleaseTarget('db-bpl-drehpunkt'), true)
  assert.equal(isProductionReleaseTarget('demo-drehpunkt-dev'), false)
  assert.deepEqual(visibleReleaseNotes(releaseNotes, { production: true }).map((note) => note.version), ['1.0.0'])
  assert.deepEqual(visibleReleaseNotes([{ ...releaseNotes[0], status: 'published' }], { production: true }), [], 'unvollständige Freigabedaten bleiben unsichtbar')
  assert.deepEqual(visibleReleaseNotes(releaseNotes).map((note) => note.version), ['1.1.0', '1.0.0'])
  assert.equal(releaseNotes[0].status, 'preview')
  assert.equal(releaseNotes[0].publishedAt, null)
  assert.equal(releaseNotes[1].releaseId, 'v1.0.0')
  assert.equal(formatReleaseDate(null), 'Noch nicht veröffentlicht')
  assert.match(formatReleaseDate('2026-09-20'), /20\. September 2026/)
  assert.equal(releaseNotes[0].sections.length, 5)
})

test('Updates is next to News, protected only by the active-user layout and has a page title', () => {
  const app = read('../App.jsx')
  const sidebar = read('../components/layout/Sidebar.jsx')
  assert.match(app, /<Route element=\{<ProtectedAppLayout \/>\}>/)
  assert.match(app, /<Route path="\/updates" element=\{<UpdatesPage \/>\} \/>/)
  assert.doesNotMatch(app, /path="\/updates" element=\{<PermissionRoute/)
  assert.match(sidebar, /label: 'News'[^\n]+\n\s*\{ label: 'Updates', to: '\/updates', icon: DocumentsIcon, group: 'overview' \}/)
  assert.equal(getPageTitle('/updates'), 'Updates')
})

test('Updates renders a featured version, collapsible history and unobtrusive technical details', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const server = await createServer({ configFile: false, root, server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { default: UpdatesPage } = await server.ssrLoadModule('/src/pages/UpdatesPage.jsx')
    const markup = renderToStaticMarkup(createElement(UpdatesPage))
    assert.match(markup, /aria-label="Neueste Version 1\.1\.0"/)
    assert.match(markup, /Vorschau · nicht veröffentlicht/)
    assert.match(markup, /Neu: Stammdatenimport/)
    assert.match(markup, /Partner zusammenführen/)
    assert.match(markup, /<details class="updates-page__history-item"/)
    assert.match(markup, /Version 1\.0\.0/)
    assert.match(markup, /<details class="updates-page__technical"/)
    assert.doesNotMatch(markup, /<input|<textarea/)
  } finally {
    await server.close()
  }
})
