import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import process from 'node:process'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { JSDOM } from 'jsdom'

const root = fileURLToPath(new URL('../', import.meta.url))
const boundary = path.join(root, 'scripts/fixtures/liability-ui-boundaries.js')
const stubbed = new Set([
  'lib/liabilityWorkflow.js', 'lib/diagnostics.js', 'lib/liabilityLetterPdf.js',
  'hooks/useCompanyStamp.js', 'hooks/usePersonalDocumentSignature.js',
].map(file => path.join(root, 'src', file).replaceAll('\\', '/')))
const resultDirectory = path.join(root, 'tmp/liability-ui-tests')
await build({
  configFile: false, root, logLevel: 'error',
  plugins: [
    { name: 'liability-ui-external-boundaries', enforce: 'pre', resolveId(source, importer) {
      if (importer && source.startsWith('.')) {
        const resolved = path.resolve(path.dirname(importer.split('?')[0]), source).replaceAll('\\', '/')
        if (stubbed.has(resolved)) return boundary
      }
    } },
    react(),
  ],
  build: {
    ssr: path.join(root, 'src/pages/LiabilityLetterPage.ui.test.jsx'),
    outDir: resultDirectory, emptyOutDir: true, minify: false,
    rollupOptions: { output: { entryFileNames: 'tests.mjs' } },
  },
})
process.env.NODE_ENV = 'development'
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://dev.drehpunktlogistik.de/vorlagen/haftbarhaltung', pretendToBeVisual: true })
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Event', 'MouseEvent', 'Node', 'getComputedStyle']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: typeof dom.window[name] === 'function' && name === 'getComputedStyle' ? dom.window[name].bind(dom.window) : dom.window[name] })
}
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window)
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window)
globalThis.IS_REACT_ACT_ENVIRONMENT = true
await import(pathToFileURL(path.join(resultDirectory, 'tests.mjs')).href)
