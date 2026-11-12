// Local browser QA: genuine To-do services and Firestore rules, synthetic
// emulator identities only. No Firebase credentials or external mail calls.
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const root = fileURLToPath(new URL('../', import.meta.url))
const emulator = process.env.FIRESTORE_EMULATOR_HOST
if (!/^(localhost|127\.0\.0\.1):\d+$/.test(emulator || '')) throw new Error('A local Firestore emulator is required.')
const projectId = `demo-todo-browser-${randomUUID().slice(0, 12)}`
const require = createRequire(new URL('../functions/package.json', import.meta.url))
const { initializeApp, deleteApp } = require('firebase-admin/app')
const { getFirestore, Timestamp } = require('firebase-admin/firestore')
const app = initializeApp({ projectId }, projectId)
const db = getFirestore(app)
const rules = await fetch(`http://${emulator}/emulator/v1/projects/${projectId}:securityRules`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: await readFile(path.join(root, 'firestore.rules'), 'utf8') }] } }) })
if (!rules.ok) throw new Error(await rules.text())
const people = [
  { id: 'owner', firstName: 'Clara', lastName: 'Erstellerin', department: 'Disposition', level: 'edit' },
  { id: 'alice', firstName: 'Anna', lastName: 'Buchhaltung', department: 'Buchhaltung', level: 'edit' },
  { id: 'bob', firstName: 'Ben', lastName: 'Buchhaltung', department: 'Buchhaltung', level: 'edit' },
  { id: 'viewer', firstName: 'Lena', lastName: 'Leserecht', department: 'Buchhaltung', level: 'view' },
  { id: 'outsider', firstName: 'Oskar', lastName: 'Disposition', department: 'Disposition', level: 'edit' },
]
const profiles = Object.fromEntries(people.map(({ id, level, ...entry }) => [id, { ...entry, active: true, role: 'user', email: `${id}@example.invalid`, permissions: { todos: level } }]))
async function seed() {
  for (const [id, profile] of Object.entries(profiles)) await db.doc(`users/${id}`).set(profile)
  const task = db.doc('todos/task')
  await db.recursiveDelete(task)
  await task.set({ title: 'Monatsabschluss gemeinsam vorbereiten', description: 'Lokale Testaufgabe: Belege prüfen, Rückfragen klären und Unterlagen vollständig bereitstellen.', priority: 'medium', audienceType: 'people', audienceId: null, audienceIds: ['alice', 'bob', 'viewer'], audienceLabel: 'Anna Buchhaltung, Ben Buchhaltung, Lena Leserecht', creatorUserId: 'owner', creatorName: 'Clara Erstellerin', assignedUserId: null, assignedUserName: null, assignedAt: null, status: 'open', completedAt: null, completedByUserId: null, completedByName: null, withdrawnAt: null, withdrawnByUserId: null, dueDate: '2026-12-10', reminderDate: null, reminderTime: null, reminderOccurrence: null, reminderRecipientMode: 'all', reminderRecipientUserIds: [], createdAt: Timestamp.now(), updatedAt: Timestamp.now() })
  const dates = [
    { id: 'deadline', type: 'deadline', date: '2026-12-10', time: '14:00', note: 'Unterlagen für den Monatsabschluss bereitstellen.', reminderEnabled: true, reminderRecipientMode: 'selected', reminderRecipientUserIds: ['alice', 'bob'] },
    { id: 'appointment', type: 'appointment', date: '2026-12-08', time: '09:30', note: 'Gemeinsame Abstimmung zur Vollständigkeit der Belege.', reminderEnabled: false, reminderRecipientMode: 'all', reminderRecipientUserIds: [] },
    { id: 'past', type: 'deadline', date: '2026-11-01', time: '', note: 'Vorheriger Abstimmungstermin zur Nachvollziehbarkeit.', reminderEnabled: false, reminderRecipientMode: 'all', reminderRecipientUserIds: [] },
  ]
  for (const { id, ...date } of dates) await task.collection('deadlines').doc(id).set({ ...date, reminderOccurrence: null, createdBy: 'owner', createdByName: 'Clara Erstellerin', updatedBy: 'owner', updatedByName: 'Clara Erstellerin', createdAt: Timestamp.now(), updatedAt: Timestamp.now() })
  await task.collection('updates').doc('initial').set({ type: 'note', text: 'Bitte die offenen Belege bis zur Frist gemeinsam prüfen.', createdByUserId: 'owner', createdByName: 'Clara Erstellerin', createdAt: Timestamp.now() })
}
await seed()
const directory = async () => (await db.collection('users').get()).docs.map(entry => ({ id: entry.id, ...entry.data() }))
const fixture = path.join(root, 'scripts/fixtures/todo-browser-boundaries.jsx')
const firebaseFixture = path.join(root, 'scripts/fixtures/todo-browser-firebase.js')
const stubbed = new Set(['auth/useAuth.js', 'auth/usePermissions.js', 'lib/userProfiles.js', 'lib/businessPartners.js', 'lib/damages.js', 'lib/insolvencies.js', 'lib/transportOrders.js', 'lib/diagnostics.js', 'lib/reminders.js'].map(file => path.join(root, 'src', file).replaceAll('\\', '/')))
const previewRoot = path.join(root, 'tmp/todo-browser-qa')
await mkdir(previewRoot, { recursive: true })
await writeFile(path.join(previewRoot, 'session.json'), JSON.stringify({ projectId, emulator }))
const server = await createServer({ configFile: false, root, appType: 'custom', plugins: [
  { name: 'todo-browser-qa', enforce: 'pre', resolveId(source, importer) {
    if (!importer || !source.startsWith('.')) return
    const resolved = path.resolve(path.dirname(importer.split('?')[0]), source).replaceAll('\\', '/')
    if (resolved === path.join(root, 'src/lib/firebase.js').replaceAll('\\', '/')) return firebaseFixture
    if (stubbed.has(resolved)) return fixture
  }, configureServer(vite) {
    vite.middlewares.use(async (request, response, next) => {
      const url = new URL(request.url, 'http://127.0.0.1')
      if (url.pathname === '/qa') {
        const actor = people.some(person => person.id === url.searchParams.get('actor')) ? url.searchParams.get('actor') : 'owner'
        const config = { projectId, emulator, actor }
        response.setHeader('Content-Type', 'text/html; charset=utf-8')
        response.end(await vite.transformIndexHtml('/qa', `<!doctype html><html lang="de"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>To-do · Lokale Browserprüfung</title></head><body><div id="root"></div><script>window.__TODO_BROWSER_QA__=${JSON.stringify(config)}</script><script type="module" src="/scripts/fixtures/todo-browser-preview.jsx"></script></body></html>`))
        return
      }
      if (!url.pathname.startsWith('/__todo_qa/')) return next()
      response.setHeader('Content-Type', 'application/json')
      try {
        if (request.method === 'GET' && url.pathname === '/__todo_qa/directory') { response.end(JSON.stringify(await directory())); return }
        let raw = ''; for await (const chunk of request) raw += chunk
        const body = raw ? JSON.parse(raw) : {}
        if (request.method !== 'POST') throw new Error('POST required')
        if (url.pathname === '/__todo_qa/reset') await seed()
        else if (url.pathname === '/__todo_qa/profile' && people.some(person => person.id === body.id)) {
          if (!['Buchhaltung', 'Disposition'].includes(body.department) || !['none', 'view', 'edit'].includes(body.level)) throw new Error('Invalid test profile')
          await db.doc(`users/${body.id}`).update({ department: body.department, active: body.active !== false, 'permissions.todos': body.level })
        } else if (url.pathname === '/__todo_qa/external-title') await db.doc('todos/task').update({ title: 'Von einem Kollegen geändert', updatedAt: Timestamp.now() })
        else throw new Error('Unknown test action')
        response.end(JSON.stringify({ ok: true }))
      } catch (error) { response.statusCode = 400; response.end(JSON.stringify({ error: error.message })) }
    })
  } }, react(),
], server: { host: '127.0.0.1', port: 4178, strictPort: true } })
await server.listen()
console.log(`Local synthetic browser QA: http://127.0.0.1:4178/qa · ${projectId} · Firestore ${emulator}`)
const shutdown = async () => { await server.close(); await db.terminate(); await deleteApp(app); process.exit(0) }
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
