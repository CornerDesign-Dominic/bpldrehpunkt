import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createReminderSolutionAssets, packReminderSolution, reminderWorkflowIds, verifyReminderSolutionRoundtrip } from './prepare-reminder-solution.mjs'
import { reminderSolutionConnectionReferences } from './prepare-reminder-workflows.mjs'

const bindings = { siteUrl: 'https://fixture.sharepoint.com/sites/Reminders', developmentListId: '11111111-1111-4111-8111-111111111111', productionListId: '22222222-2222-4222-8222-222222222222' }
const templates = {
  solutionXmlTemplate: '<ImportExportXml><SolutionManifest><UniqueName>Test</UniqueName><LocalizedNames><LocalizedName description="Test" languagecode="1033" /></LocalizedNames><Version>1.0</Version><Managed>2</Managed><Publisher><UniqueName>DrehpunktReminders</UniqueName><CustomizationPrefix>dpr</CustomizationPrefix></Publisher><RootComponents /><MissingDependencies /></SolutionManifest></ImportExportXml>',
  customizationsXmlTemplate: '<ImportExportXml><Entities /><Workflows /><Languages><Language>1033</Language></Languages></ImportExportXml>',
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pacPath = resolve(root, 'tmp/pac-cli/2.14.1/tools/pac.exe')

async function cleanup(directory) {
  assert.ok(resolve(directory).startsWith(`${resolve(tmpdir())}${sep}`))
  await rm(directory, { recursive: true, force: true })
}

function visit(actions, callback) {
  for (const action of Object.values(actions)) {
    callback(action)
    if (action.actions) visit(action.actions, callback)
    if (action.else) visit(action.else.actions, callback)
  }
}

test('solution factory uses separate fixed lists and new wizard connection references without fake live IDs', () => {
  const { files, workflows } = createReminderSolutionAssets(bindings, templates)
  assert.equal(Object.keys(files).length, 4)
  for (const [name, workflow] of Object.entries(workflows)) {
    assert.equal(workflow.name, reminderWorkflowIds[name])
    assert.equal(workflow.schemaVersion, '1.0.0.0')
    assert.equal(workflow.properties.state, 'Stopped')
    assert.equal(workflow.properties.definition.parameters.testOnly.defaultValue, true)
    for (const [key, reference] of Object.entries(workflow.properties.connectionReferences)) {
      assert.deepEqual(reference, { api: { name: key }, connection: { connectionReferenceLogicalName: reminderSolutionConnectionReferences[key] }, runtimeSource: 'embedded' })
      assert.ok(reference.connection.connectionReferenceLogicalName.startsWith('dpr_'))
      assert.equal(reference.connection.name, undefined)
      assert.equal(reference.connectionName, undefined)
    }
    visit(workflow.properties.definition.actions, action => {
      if (action.type !== 'OpenApiConnection') return
      assert.equal(action.inputs.authentication, undefined)
      const key = action.inputs.host.connectionName
      assert.ok(workflow.properties.connectionReferences[key])
      assert.deepEqual(action.inputs.retryPolicy, { type: 'none' })
      if (key === 'shared_sharepointonline') assert.equal(action.inputs.parameters.table, name === 'dev' ? bindings.developmentListId : bindings.productionListId)
    })
  }
  assert.ok(!JSON.stringify(workflows).includes('local-fixture'))
  assert.equal((files['Other/Solution.xml'].match(/type="29"/g) || []).length, 2)
  assert.match(files['Other/Solution.xml'], /<Managed>0<\/Managed>/)
  assert.match(files['Other/Solution.xml'], /<UniqueName>DrehpunktReminders<\/UniqueName>/)
  const xml = files['Other/Customizations.xml']
  assert.equal((xml.match(/<Workflow WorkflowId=/g) || []).length, 2)
  assert.equal((xml.match(/<StateCode>0<\/StateCode><StatusCode>1<\/StatusCode>/g) || []).length, 2)
  assert.equal((xml.match(/<connectionreference connectionreferencelogicalname=/g) || []).length, 2)
  assert.ok(verifyReminderSolutionRoundtrip(files, workflows))
})

test('factory fails closed on missing list, identical environment lists, live connection IDs and incompatible init templates', () => {
  for (const patch of [{ productionListId: null }, { productionListId: bindings.developmentListId }, { outlookConnectionId: 'shared-office365-do-not-embed' }, { sharePointConnectionId: null }, { siteUrl: 'http://fixture.sharepoint.com/sites/A' }]) assert.throws(() => createReminderSolutionAssets({ ...bindings, ...patch }, templates))
  assert.throws(() => createReminderSolutionAssets(bindings, { ...templates, solutionXmlTemplate: templates.solutionXmlTemplate.replace('<Managed>2</Managed>', '') }), /template/)
})

test('roundtrip verifier rejects missing workflows, activation drift and lost connection references', () => {
  const { files, workflows } = createReminderSolutionAssets(bindings, templates)
  const missing = { ...files }
  delete missing[Object.keys(missing).find(path => path.startsWith('Workflows/'))]
  assert.throws(() => verifyReminderSolutionRoundtrip(missing, workflows), /exactly two/)
  assert.throws(() => verifyReminderSolutionRoundtrip({ ...files, 'Other/Customizations.xml': files['Other/Customizations.xml'].replace('<StateCode>0</StateCode>', '<StateCode>1</StateCode>') }, workflows), /Draft\/Off/)
  assert.throws(() => verifyReminderSolutionRoundtrip({ ...files, 'Other/Customizations.xml': files['Other/Customizations.xml'].replaceAll('dpr_reminders_sharedoffice365', 'removed') }, workflows), /wizard connection/)
  const changed = structuredClone(files)
  const path = Object.keys(changed).find(value => value.startsWith('Workflows/'))
  changed[path] = changed[path].replace('"Stopped"', '"Started"')
  assert.throws(() => verifyReminderSolutionRoundtrip(changed, workflows), /changed workflow/)
})

test('invalid configuration invokes no PAC process and writes no package', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dpr-invalid-solution-'))
  try {
    let invoked = false
    await assert.rejects(packReminderSolution({ bindings: {}, pacPath: 'unused', outputDirectory: directory, runPac: async () => { invoked = true } }))
    assert.equal(invoked, false)
    assert.deepEqual(await readdir(directory), [])
  } finally { await cleanup(directory) }
})

test('real local Microsoft PAC packs and unpacks both draft workflows without login or cloud command', { skip: !existsSync(pacPath), timeout: 60000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dpr-pac-solution-'))
  try {
    const result = await packReminderSolution({ bindings, pacPath, outputDirectory: directory })
    assert.ok(existsSync(result.zipPath))
    assert.equal(result.manifest.localPacPackUnpackVerified, true)
    assert.equal(result.manifest.cloudImportValidated, false)
    assert.equal(result.manifest.cloudActivated, false)
    assert.equal(result.manifest.stateCode, 0)
    assert.equal(result.manifest.testOnly, true)
    assert.ok(result.manifest.importGates.some(value => value.includes('Off/Draft after import')))
    const manifest = JSON.parse(await readFile(join(dirname(result.zipPath), 'local-package-manifest.json'), 'utf8'))
    assert.deepEqual(manifest, result.manifest)
  } finally { await cleanup(directory) }
})
