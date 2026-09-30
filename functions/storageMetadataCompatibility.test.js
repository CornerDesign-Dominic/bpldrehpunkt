import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import process from 'node:process'
import test from 'node:test'

const require = createRequire(import.meta.url)
const storageRequire = createRequire(require.resolve('@google-cloud/storage'))
const authRequire = createRequire(storageRequire.resolve('google-auth-library'))
const metadata = authRequire('gcp-metadata')

test('the Storage authentication stack accepts metadata server response headers', async () => {
  // gcp-metadata 6 reads response headers as a plain object. gaxios 7 changed
  // that shape and caused Cloud Run downloads to fail before reaching Storage.
  assert.match(storageRequire('gaxios/package.json').version, /^6\./)
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Metadata-Flavor': 'Google', 'Content-Type': 'text/plain' })
    response.end('ok')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const previousHost = process.env.GCE_METADATA_HOST
  process.env.GCE_METADATA_HOST = `127.0.0.1:${server.address().port}`
  try {
    assert.equal(await metadata.instance('test'), 'ok')
  } finally {
    if (previousHost === undefined) delete process.env.GCE_METADATA_HOST
    else process.env.GCE_METADATA_HOST = previousHost
    await new Promise((resolve) => server.close(resolve))
  }
})
