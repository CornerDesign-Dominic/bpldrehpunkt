import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const rules = await readFile(new URL('../storage.rules', import.meta.url), 'utf8')
const signatureClient = await readFile(new URL('../src/lib/userSignature.js', import.meta.url), 'utf8')

test('signatures are restricted to the authenticated owner, including administrators', () => {
  assert.match(rules, /function ownsSignature\(uid\) \{[\s\S]*request\.auth != null[\s\S]*request\.auth\.uid == uid[\s\S]*profileIsActive\(\);/)
  assert.match(rules, /match \/user-signatures\/\{uid\}\/signature\.jpg \{[\s\S]*allow read: if ownsSignature\(uid\);[\s\S]*allow create, update: if ownsSignature\(uid\) && isJpegSignature\(\);[\s\S]*allow delete: if ownsSignature\(uid\);/)
  const signatureRule = rules.match(/match \/user-signatures\/\{uid\}\/signature\.jpg \{([\s\S]*?)\n {4}\}/)?.[1] || ''
  assert.doesNotMatch(signatureRule, /admin|superadmin|canReadDocuments|canEditDocuments/)
  assert.doesNotMatch(rules, /match \/\{allPaths=\*\*\}/)
})

test('signature uploads are JPEGs under 2 MB at Firebase Rules level', () => {
  assert.match(rules, /function isJpegSignature\(\) \{[\s\S]*request\.resource\.contentType == 'image\/jpeg'[\s\S]*request\.resource\.size <= 2 \* 1024 \* 1024;/)
})

test('the browser client derives the fixed signature path from Firebase Auth only', () => {
  assert.match(signatureClient, /const uid = auth\.currentUser\?\.uid/)
  assert.match(signatureClient, /`user-signatures\/\$\{uid\}\/signature\.jpg`/)
  assert.doesNotMatch(signatureClient, /getDownloadURL/)
  assert.match(signatureClient, /getBlob\(currentUserSignatureRef\(\)\)/)
})
