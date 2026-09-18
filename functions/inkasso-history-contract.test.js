import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8')
const client = await readFile(new URL('../src/lib/inkasso.js', import.meta.url), 'utf8')
const historyFunction = await readFile(new URL('./inkassoHistory.js', import.meta.url), 'utf8')

const inkassoRules = rules.match(/match \/inkassoCases\/\{id\} \{([\s\S]*?)\n {4}\}\n {4}function todoKeysAreValid/)?.[1] || ''
const updatesRule = inkassoRules.match(/match \/updates\/\{updateId\} \{([\s\S]*?)\n {6}\}/)?.[1] || ''
const historyRule = inkassoRules.match(/match \/history\/\{historyId\} \{([\s\S]*?)\n {6}\}/)?.[1] || ''
const invoicesRule = inkassoRules.match(/match \/invoices\/\{invoiceId\} \{([\s\S]*?)\n {6}\}/)?.[1] || ''
const deadlinesRule = inkassoRules.match(/match \/deadlines\/\{deadlineId\} \{([\s\S]*?)\n {6}\}/)?.[1] || ''

test('inkasso editors cannot create, update, or delete system history from a browser client', () => {
  assert.match(updatesRule, /data\.type == 'note'/)
  assert.doesNotMatch(updatesRule, /data\.type in \['note', 'system'\]/)
  assert.match(updatesRule, /allow update, delete: if false;/)
  assert.match(historyRule, /allow read: if view\('inkasso'\);/)
  assert.match(historyRule, /allow write: if false;/)
})

test('manual updates remain tied to the authenticated editor and server time', () => {
  assert.match(updatesRule, /allow create: if edit\('inkasso'\) && validInkassoCaseUpdate\(request\.resource\.data\)/)
  assert.match(updatesRule, /data\.createdByUserId == request\.auth\.uid/)
  assert.match(updatesRule, /data\.createdAt == request\.time/)
  assert.match(client, /updatePayload\('note', cleanText, actor\)/)
  assert.doesNotMatch(client, /updatePayload\('system'/)
})

test('invoice creation, editing, and payment changes keep the case totals atomically consistent', () => {
  assert.match(invoicesRule, /allow update: if edit\('inkasso'\) && validInkassoInvoice\(request\.resource\.data\)/)
  assert.match(invoicesRule, /allow create: if edit\('inkasso'\) && validInkassoInvoice\(request\.resource\.data\) && \(invoiceCreatedWithCase\(\) \|\| \(invoiceParentWasUpdated\(\) && invoiceAmountsFollowCreate\(\)\)\)/)
  assert.match(invoicesRule, /affectedKeys\(\)\.hasOnly\(\['invoiceNumber', 'netAmount', 'vatAmount', 'grossAmount'\]\)/)
  assert.match(invoicesRule, /invoiceAmountsFollowEdit\(\)/)
  assert.match(invoicesRule, /invoiceAmountsFollowPaymentChange\(\)/)
  assert.match(client, /export async function createInkassoCaseInvoice/)
  assert.match(client, /export async function updateInkassoCaseInvoice/)
})

test('inkasso deadlines require an atomic parent update and retain creation metadata', () => {
  assert.match(deadlinesRule, /allow create: if edit\('inkasso'\) && validInkassoDeadline\(request\.resource\.data\) && deadlineParentWasUpdated\(\)/)
  assert.match(deadlinesRule, /request\.resource\.data\.createdAt == request\.time/)
  assert.match(deadlinesRule, /affectedKeys\(\)\.hasOnly\(\['date', 'reminderEnabled', 'note', 'updatedAt', 'updatedBy', 'updatedByName'\]\)/)
  assert.match(deadlinesRule, /allow delete: if false;/)
})

test('trusted server triggers create immutable inkasso history for relevant case changes', () => {
  assert.match(historyFunction, /onDocumentCreatedWithAuthContext\(\{ region, document: 'inkassoCases\/\{caseId\}' \}/)
  assert.match(historyFunction, /onDocumentUpdatedWithAuthContext\(\{ region, document: 'inkassoCases\/\{caseId\}' \}/)
  assert.match(historyFunction, /onDocumentCreatedWithAuthContext\(\{ region, document: 'inkassoCases\/\{caseId\}\/documents\/\{documentId\}' \}/)
  assert.match(historyFunction, /onDocumentDeletedWithAuthContext\(\{ region, document: 'inkassoCases\/\{caseId\}\/documents\/\{documentId\}' \}/)
  assert.match(historyFunction, /onDocumentCreatedWithAuthContext\(\{ region, document: 'inkassoCases\/\{caseId\}\/invoices\/\{invoiceId\}' \}/)
  assert.match(historyFunction, /onDocumentUpdatedWithAuthContext\(\{ region, document: 'inkassoCases\/\{caseId\}\/invoices\/\{invoiceId\}' \}/)
  assert.match(historyFunction, /onDocumentCreatedWithAuthContext\(\{ region, document: 'inkassoCases\/\{caseId\}\/deadlines\/\{deadlineId\}' \}/)
  assert.match(historyFunction, /onDocumentUpdatedWithAuthContext\(\{ region, document: 'inkassoCases\/\{caseId\}\/deadlines\/\{deadlineId\}' \}/)
  assert.match(historyFunction, /onDocumentCreatedWithAuthContext\(\{ region, document: 'inkassoCases\/\{caseId\}\/movements\/\{movementId\}' \}/)
  assert.match(historyFunction, /source: 'server'/)
  assert.match(historyFunction, /createdAt: FieldValue\.serverTimestamp\(\)/)
  assert.match(historyFunction, /createdByUserId: actor\.userId/)
})
