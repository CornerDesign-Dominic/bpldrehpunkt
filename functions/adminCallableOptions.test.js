import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('the temporary admin fallback is narrow and keeps handler authorization intact', async () => {
  const [options, index, holidays, schoolHolidays, systemMails, aiPrompts] = await Promise.all([
    readFile(new URL('./adminCallableOptions.js', import.meta.url), 'utf8'),
    readFile(new URL('./index.js', import.meta.url), 'utf8'),
    readFile(new URL('./holidays.js', import.meta.url), 'utf8'),
    readFile(new URL('./schoolHolidays.js', import.meta.url), 'utf8'),
    readFile(new URL('./systemMails.js', import.meta.url), 'utf8'),
    readFile(new URL('./aiPrompts.js', import.meta.url), 'utf8'),
  ])

  assert.match(options, /enforceAppCheck: false/)
  assert.match(options, /valid Firebase session/)
  assert.match(index, /listManagedUsers = onCall\(adminCallableOptions/)
  assert.match(index, /await assertManager\(request\)/)
  assert.match(index, /getTomTomUsageSummary = onCall\(adminCallableOptions/)
  assert.match(index, /updateShipmentTrackingRuleCatalog = onCall\(adminCallableOptions/)
  assert.match(holidays, /refreshHolidayData = onCall\(\{ \.\.\.adminCallableOptions, timeoutSeconds: 540 \}/)
  assert.match(schoolHolidays, /requireRole\(profile, \['admin', 'superadmin'\]/)
  assert.match(systemMails, /listSystemMailTemplates = onCall\(adminCallableOptions/)
  assert.match(systemMails, /assertActiveSuperadmin\(request\)/)
  assert.match(aiPrompts, /listAiPromptConfigs = onCall\(adminCallableOptions/)
  assert.match(aiPrompts, /assertSuperadmin\(request\)/)

  assert.match(index, /listTransportOrdersPage = onCall\(\{ region: 'europe-west3', enforceAppCheck: true \}/)
  assert.match(index, /reportClientDiagnostic = onCall\(\{ region: 'europe-west3', enforceAppCheck: true, invoker: 'public' \}/)
})
