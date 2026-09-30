import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createMemoryRouter, matchRoutes } from 'react-router-dom'
import { resolvePartnerInIndex } from './partnerCluster.js'
import { businessPartnerDetailPath, crmPartnerPath, insolvencyCasePath, palletAccountPath } from './businessPartnerLinks.js'

const routes = [
  { path: '/' },
  { path: '/kunden-unternehmer/neu' },
  { path: '/kunden-unternehmer/import' },
  { path: '/kunden-unternehmer/stammdaten/:partnerId' },
  { path: '/kunden-unternehmer/:partnerId' },
  { path: '/crm/:partnerId' },
  { path: '/paletten/:partnerId' },
  { path: '/insolvenzen/:partnerId' },
]

const partnerIds = [
  'dycos-debtor-10689',
  'dycos-carrier-lippe%20transport%20logistik%20erwitte',
  'Partner mit Leerzeichen',
  'Müller & Söhne',
  'Partner+Nord#1?aktiv',
  '100% Logistik',
  'neu',
  'import',
  'stammdaten',
]

function* sourceFiles(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) yield* sourceFiles(path)
    else if (entry.isFile() && /\.(?:js|jsx)$/.test(entry.name) && !entry.name.endsWith('.test.js') && entry.name !== 'businessPartnerLinks.js') yield path
  }
}

test('partner detail paths encode original Firestore IDs exactly once and the route restores them', () => {
  for (const partnerId of partnerIds) {
    const path = businessPartnerDetailPath(partnerId)
    assert.equal(path, `/kunden-unternehmer/stammdaten/${encodeURIComponent(partnerId)}`)
    assert.equal(decodeURIComponent(path.split('/').at(-1)), partnerId)
    assert.equal(matchRoutes(routes, path)?.at(-1)?.params.partnerId, partnerId)
  }
})

test('direct load, reload and browser history preserve special-character partner IDs', async () => {
  for (const partnerId of partnerIds) {
    const path = businessPartnerDetailPath(partnerId)
    const initial = createMemoryRouter(routes, { initialEntries: [path] })
    assert.equal(initial.state.matches.at(-1).params.partnerId, partnerId)
    initial.dispose()

    const router = createMemoryRouter(routes, { initialEntries: ['/'] })
    await router.navigate(path)
    assert.equal(router.state.matches.at(-1).params.partnerId, partnerId)
    await router.navigate(-1)
    assert.equal(router.state.location.pathname, '/')
    await router.navigate(1)
    assert.equal(router.state.matches.at(-1).params.partnerId, partnerId)
    router.dispose()
  }
})

test('pallet account paths use the same canonical, encoded Firestore partner ID', async () => {
  for (const partnerId of partnerIds) {
    const path = palletAccountPath(partnerId)
    assert.equal(path, `/paletten/${encodeURIComponent(partnerId)}`)
    assert.equal(matchRoutes(routes, path)?.at(-1)?.params.partnerId, partnerId)

    const router = createMemoryRouter(routes, { initialEntries: [path] })
    assert.equal(router.state.matches.at(-1)?.params.partnerId, partnerId)
    await router.navigate(path)
    assert.equal(router.state.matches.at(-1)?.params.partnerId, partnerId)
    router.dispose()
  }
})

test('CRM paths use the same canonical, encoded Firestore partner ID', async () => {
  for (const partnerId of partnerIds) {
    const path = crmPartnerPath(partnerId)
    assert.equal(path, `/crm/${encodeURIComponent(partnerId)}`)
    assert.equal(matchRoutes(routes, path)?.at(-1)?.params.partnerId, partnerId)

    const router = createMemoryRouter(routes, { initialEntries: [path] })
    assert.equal(router.state.matches.at(-1)?.params.partnerId, partnerId)
    await router.navigate(path)
    assert.equal(router.state.matches.at(-1)?.params.partnerId, partnerId)
    router.dispose()
  }
})

test('insolvency case paths preserve the canonical partner ID on direct load, reload and history navigation', async () => {
  for (const partnerId of partnerIds) {
    const path = insolvencyCasePath(partnerId)
    assert.equal(path, `/insolvenzen/${encodeURIComponent(partnerId)}`)
    assert.equal(matchRoutes(routes, path)?.at(-1)?.params.partnerId, partnerId)

    const initial = createMemoryRouter(routes, { initialEntries: [path] })
    assert.equal(initial.state.matches.at(-1)?.params.partnerId, partnerId)
    initial.dispose()

    const router = createMemoryRouter(routes, { initialEntries: ['/'] })
    await router.navigate(path)
    assert.equal(router.state.matches.at(-1)?.params.partnerId, partnerId)
    await router.navigate(-1)
    await router.navigate(1)
    assert.equal(router.state.matches.at(-1)?.params.partnerId, partnerId)
    router.dispose()
  }
})

test('archived partner links retain the source ID and resolve to the active partner', () => {
  const sourceId = 'dycos-carrier-lippe%20transport'
  const targetId = 'Müller+Logistik#1?'
  const partners = new Map([
    [sourceId, { id: sourceId, status: 'merged', mergedIntoPartnerId: targetId }],
    [targetId, { id: targetId, status: 'active' }],
  ])

  const archivedPath = businessPartnerDetailPath(sourceId)
  const sourceFromRoute = matchRoutes(routes, archivedPath)?.at(-1)?.params.partnerId
  assert.equal(sourceFromRoute, sourceId)
  assert.equal(resolvePartnerInIndex(partners, sourceFromRoute)?.id, targetId)
  assert.equal(matchRoutes(routes, businessPartnerDetailPath(targetId))?.at(-1)?.params.partnerId, targetId)
})

test('existing legacy detail URLs remain readable', () => {
  const legacyPath = '/kunden-unternehmer/dycos-debtor-10689'
  assert.equal(matchRoutes(routes, legacyPath)?.at(-1)?.params.partnerId, 'dycos-debtor-10689')
})

test('all partner navigation modules use the central detail path', () => {
  const modules = [
    '../pages/CustomersPage.jsx',
    '../pages/TransportOrderDetailPage.jsx',
    '../pages/TodoDetailPage.jsx',
    '../pages/DamageDetailPage.jsx',
    '../pages/CrmDetailPage.jsx',
    '../components/pallets/PalletAccountDetail.jsx',
    '../pages/InkassoCaseDetailPage.jsx',
    '../pages/InsolvencyDetailPage.jsx',
    '../pages/BusinessPartnerFormPage.jsx',
    '../components/business-partners/BusinessPartnerForm.jsx',
    './customerImportPresentation.js',
  ]
  for (const modulePath of modules) {
    assert.match(readFileSync(new URL(modulePath, import.meta.url), 'utf8'), /businessPartnerDetailPath\(/, modulePath)
  }

  const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')
  const detailPage = readFileSync(new URL('../pages/BusinessPartnerFormPage.jsx', import.meta.url), 'utf8')
  assert.match(app, /path="\/kunden-unternehmer\/stammdaten\/:partnerId"/)
  assert.match(app, /path="\/kunden-unternehmer\/:partnerId"/)
  assert.match(detailPage, /const \{ partnerId \} = useParams\(\)/)
  assert.match(detailPage, /getBusinessPartner\(partnerId\)/)
  assert.doesNotMatch(detailPage, /decodeURIComponent\(partnerId\)/)

  for (const path of sourceFiles(fileURLToPath(new URL('../', import.meta.url)))) {
    const source = readFileSync(path, 'utf8')
    assert.doesNotMatch(source, /\/kunden-unternehmer\/(?:stammdaten\/)?\$\{/, path)
  }
})

test('pallet navigation never substitutes a DyCoS number for the partner ID', () => {
  const modules = [
    '../components/business-partners/BusinessPartnerHeader.jsx',
    '../components/pallets/PalletAccountList.jsx',
  ]
  for (const modulePath of modules) {
    const source = readFileSync(new URL(modulePath, import.meta.url), 'utf8')
    assert.match(source, /palletAccountPath\(/, modulePath)
    assert.doesNotMatch(source, /\/paletten\/\$\{partnerId\}/, modulePath)
  }
})

test('CRM navigation never interpolates an unencoded Firestore partner ID', () => {
  const modules = [
    '../components/business-partners/BusinessPartnerHeader.jsx',
    '../pages/CrmPage.jsx',
  ]
  for (const modulePath of modules) {
    const source = readFileSync(new URL(modulePath, import.meta.url), 'utf8')
    assert.match(source, /crmPartnerPath\(/, modulePath)
    assert.doesNotMatch(source, /\/crm\/\$\{partner(?:Id|\.id)\}/, modulePath)
  }
})

test('insolvency navigation never interpolates an unencoded canonical partner ID', () => {
  const modules = [
    '../pages/InsolvenciesPage.jsx',
    '../pages/TodoDetailPage.jsx',
    './systemCalendars.js',
  ]
  for (const modulePath of modules) {
    const source = readFileSync(new URL(modulePath, import.meta.url), 'utf8')
    assert.match(source, /insolvencyCasePath\(/, modulePath)
  }

  for (const path of sourceFiles(fileURLToPath(new URL('../', import.meta.url)))) {
    const source = readFileSync(path, 'utf8')
    assert.doesNotMatch(source, /\/insolvenzen\/\$\{/, path)
  }
})
