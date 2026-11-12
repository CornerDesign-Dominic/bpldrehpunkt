import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import process from 'node:process'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { JSDOM } from 'jsdom'

const root = fileURLToPath(new URL('../', import.meta.url))
const boundary = path.join(root, 'scripts/fixtures/calendar-ui-boundaries.js')
const stubbed = new Set(['auth/useAuth.js', 'company-holidays/useCompanyHolidaySettings.js', 'lib/calendars.js', 'lib/systemCalendars.js', 'lib/todoCalendars.js', 'lib/diagnostics.js', 'components/calendar/CalendarEventModal.jsx'].map(file => path.join(root, 'src', file).replaceAll('\\', '/')))
const resultDirectory = path.join(root, 'tmp/calendar-ui-tests')
await build({ configFile: false, root, logLevel: 'error', plugins: [
  { name: 'calendar-ui-boundaries', enforce: 'pre', resolveId(source, importer) {
    if (importer && source.startsWith('.')) {
      const resolved = path.resolve(path.dirname(importer.split('?')[0]), source).replaceAll('\\', '/')
      if (stubbed.has(resolved)) return boundary
    }
  } }, react(),
], build: { ssr: path.join(root, 'src/pages/CalendarCollaboration.ui.test.jsx'), outDir: resultDirectory, emptyOutDir: true, minify: false, rollupOptions: { output: { entryFileNames: 'tests.mjs' } } } })
process.env.NODE_ENV = 'development'
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://dev.drehpunktlogistik.de/kalender', pretendToBeVisual: true })
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Event', 'MouseEvent', 'Node', 'getComputedStyle', 'localStorage']) Object.defineProperty(globalThis, name, { configurable: true, value: name === 'getComputedStyle' ? dom.window[name].bind(dom.window) : dom.window[name] })
globalThis.IS_REACT_ACT_ENVIRONMENT = true
await import(pathToFileURL(path.join(resultDirectory, 'tests.mjs')).href)
