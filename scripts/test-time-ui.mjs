import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { readFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import process from 'node:process'

const root = fileURLToPath(new URL('../', import.meta.url))
await build({ configFile: false, root, logLevel: 'error', define: { 'import.meta.env.VITE_TIME_PWA_URL': JSON.stringify('https://db-bpl-drehpunkt-dev-time.web.app') }, plugins: [{
  name: 'time-test-boundaries', enforce: 'pre',
  async load(id) {
    if (id.endsWith('/src/auth/useAuth.js')) return "export const useAuth = () => ({ user: { uid: 'test-user' }, profile: { active: true, role: 'user', permissions: { timeTracking: 'edit' } } })"
    if (id.endsWith('/src/lib/timeTracking.js')) {
      const source = await readFile(id, 'utf8')
      const helpers = source.slice(source.indexOf('export const TIME_ACTIONS'))
      return `${helpers}\nexport const listTimeWorkspace = data => globalThis.timeUiApi.workspace(data); export const getOwnTimeWorkModels = () => globalThis.timeUiApi.models(); export const listOwnTimeBookings = data => globalThis.timeUiApi.bookings(data); export const stampTime = data => globalThis.timeUiApi.stamp?.(data); export const correctTimeDay = data => globalThis.timeUiApi.correct?.(data);`
    }
  },
}, react()], build: { ssr: path.join(root, 'src/pages/TimeTrackingPage.ui.test.jsx'), outDir: path.join(root, 'tmp/time-ui-tests'), emptyOutDir: true, minify: false, rollupOptions: { output: { entryFileNames: 'tests.mjs' } } } })
const dom = new JSDOM('<html><body></body></html>', { url: 'https://example.test/zeiterfassung', pretendToBeVisual: true })
process.env.NODE_ENV = 'development'
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Event', 'MouseEvent', 'Node']) Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] })
dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
globalThis.IS_REACT_ACT_ENVIRONMENT = true
await import(pathToFileURL(path.join(root, 'tmp/time-ui-tests/tests.mjs')).href)
