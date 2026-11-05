import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import process from 'node:process'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { JSDOM } from 'jsdom'

const root = fileURLToPath(new URL('../', import.meta.url))
const boundary = path.join(root, 'scripts/fixtures/mailbox-ai-settings-boundary.js')
const sourceBoundary = path.join(root, 'src/lib/mailboxes.js').replaceAll('\\', '/')
const resultDirectory = path.join(root, 'tmp/mailbox-ai-settings-ui-tests')
await build({
  configFile: false, root, logLevel: 'error',
  plugins: [
    { name: 'mailbox-ai-settings-boundary', enforce: 'pre', resolveId(source, importer) {
      if (importer && source.startsWith('.') && path.resolve(path.dirname(importer.split('?')[0]), source).replaceAll('\\', '/') === sourceBoundary) return boundary
    } }, react(),
  ],
  build: { ssr: path.join(root, 'src/components/mailboxes/MailboxRecommendationSettings.ui.test.jsx'), outDir: resultDirectory, emptyOutDir: true, minify: false, rollupOptions: { output: { entryFileNames: 'tests.mjs' } } },
})
process.env.NODE_ENV = 'development'
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://dev.drehpunktlogistik.de/profil', pretendToBeVisual: true })
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'Event', 'MouseEvent', 'Node', 'getComputedStyle']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: typeof dom.window[name] === 'function' && name === 'getComputedStyle' ? dom.window[name].bind(dom.window) : dom.window[name] })
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true
await import(pathToFileURL(path.join(resultDirectory, 'tests.mjs')).href)
