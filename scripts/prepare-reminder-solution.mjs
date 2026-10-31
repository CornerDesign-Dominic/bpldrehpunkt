import { execFile } from 'node:child_process'
import { promisify, isDeepStrictEqual } from 'node:util'
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createReminderWorkflowResources, reminderSolutionConnectionReferences } from './prepare-reminder-workflows.mjs'

const runFile = promisify(execFile)
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const reminderSolutionName = 'DrehpunktReminderTransport'
export const reminderSolutionVersion = '1.0.0.2'
export const reminderWorkflowIds = Object.freeze({ dev: '6e3adb39-5442-4594-a57b-cb812be70f9b', production: 'c1c89a9c-8c98-46c5-9d8d-cbfad7177d65' })
const escapeXml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')

function replaceExactlyOnce(xml, expression, replacement, label) {
  if ([...xml.matchAll(new RegExp(expression.source, 'g'))].length !== 1) throw new Error(`Unexpected PAC template: ${label}`)
  return xml.replace(expression, replacement)
}

/** Creates solution files from PAC's own init templates; no connections, credentials
 * or fake connection IDs are required. Runtime references use the Microsoft ZIP
 * export form (host.connectionName is a connector-map key, not a live connection). */
export function createReminderSolutionAssets(bindings, { solutionXmlTemplate, customizationsXmlTemplate }) {
  const resources = createReminderWorkflowResources(bindings, { testOnly: true, connectionMode: 'solution' })
  const workflows = Object.fromEntries(Object.entries(resources).map(([name, resource]) => [name, {
    name: reminderWorkflowIds[name], properties: resource.properties, schemaVersion: '1.0.0.0',
  }]))
  const files = {}
  const components = []
  const workflowElements = []
  for (const [name, workflow] of Object.entries(workflows)) {
    const id = reminderWorkflowIds[name]
    const displayName = workflow.properties.displayName
    const filename = `${name}-${id.toUpperCase()}.json`
    files[`Workflows/${filename}`] = `${JSON.stringify(workflow, null, 2)}\n`
    components.push(`      <RootComponent type="29" id="{${id}}" behavior="0" />`)
    // Field names follow Microsoft's Industry-Links packaging sample. State values
    // follow the workflow entity contract: 0/1 means Draft/Off, not Activated.
    workflowElements.push(`    <Workflow WorkflowId="{${id}}" Name="${escapeXml(displayName)}">
      <JsonFileName>/Workflows/${filename}</JsonFileName>
      <Type>1</Type><Subprocess>0</Subprocess><Category>5</Category><Mode>0</Mode><Scope>4</Scope>
      <OnDemand>0</OnDemand><TriggerOnCreate>0</TriggerOnCreate><TriggerOnDelete>0</TriggerOnDelete>
      <AsyncAutoDelete>0</AsyncAutoDelete><SyncWorkflowLogOnFailure>0</SyncWorkflowLogOnFailure>
      <StateCode>0</StateCode><StatusCode>1</StatusCode><RunAs>1</RunAs><IsTransacted>1</IsTransacted>
      <IntroducedVersion>${reminderSolutionVersion}</IntroducedVersion><IsCustomizable>1</IsCustomizable>
      <BusinessProcessType>0</BusinessProcessType><IsCustomProcessingStepAllowedForOtherPublishers>1</IsCustomProcessingStepAllowedForOtherPublishers>
      <PrimaryEntity>none</PrimaryEntity>
      <LocalizedNames><LocalizedName languagecode="1033" description="${escapeXml(displayName)}" /></LocalizedNames>
    </Workflow>`)
  }
  // The first UniqueName/LocalizedName in the PAC template belongs to the solution;
  // subsequent entries describe the publisher and must stay untouched.
  let solutionXml = solutionXmlTemplate.replace(/<UniqueName>[^<]*<\/UniqueName>/, `<UniqueName>${reminderSolutionName}</UniqueName>`)
  solutionXml = solutionXml.replace(/<LocalizedName description="[^"]*"/, `<LocalizedName description="${reminderSolutionName}"`)
  solutionXml = replaceExactlyOnce(solutionXml, /<Version>[^<]*<\/Version>/, `<Version>${reminderSolutionVersion}</Version>`, 'Version')
  solutionXml = replaceExactlyOnce(solutionXml, /<Managed>[^<]*<\/Managed>/, '<Managed>0</Managed>', 'Managed')
  solutionXml = replaceExactlyOnce(solutionXml, /<RootComponents\s*\/>/, `<RootComponents>\n${components.join('\n')}\n    </RootComponents>`, 'empty RootComponents')
  if (!solutionXml.includes(`<UniqueName>${reminderSolutionName}</UniqueName>`) || !solutionXml.includes('<CustomizationPrefix>dpr</CustomizationPrefix>')) throw new Error('Unexpected PAC publisher/solution template')
  const references = Object.entries(reminderSolutionConnectionReferences).map(([api, logicalName]) => `    <connectionreference connectionreferencelogicalname="${logicalName}">
      <connectionreferencedisplayname>Drehpunkt reminders ${api === 'shared_office365' ? 'Outlook df' : 'SharePoint ledger'}</connectionreferencedisplayname>
      <connectorid>/providers/Microsoft.PowerApps/apis/${api}</connectorid>
      <iscustomizable>1</iscustomizable><statecode>0</statecode><statuscode>1</statuscode>
    </connectionreference>`)
  let customizationsXml = replaceExactlyOnce(customizationsXmlTemplate, /<Workflows\s*\/>/, `<Workflows>\n${workflowElements.join('\n')}\n  </Workflows>`, 'empty Workflows')
  customizationsXml = replaceExactlyOnce(customizationsXml, /<\/ImportExportXml>/, `  <connectionreferences>\n${references.join('\n')}\n  </connectionreferences>\n</ImportExportXml>`, 'ImportExportXml')
  files['Other/Solution.xml'] = solutionXml
  files['Other/Customizations.xml'] = customizationsXml
  return { files, workflows }
}

async function pacLocal(pacPath, args) {
  if (args[0] !== 'solution' || !['init', 'pack', 'unpack'].includes(args[1])) throw new Error('Only offline PAC init/pack/unpack are permitted')
  const result = await runFile(pacPath, args, { windowsHide: true, timeout: 60000, maxBuffer: 1024 * 1024 })
  return result.stdout
}

async function readTree(directory, prefix = '') {
  const files = {}
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) Object.assign(files, await readTree(path, relative))
    else files[relative] = await readFile(path, 'utf8')
  }
  return files
}

export function verifyReminderSolutionRoundtrip(unpackedFiles, expectedWorkflows) {
  const jsonFiles = Object.entries(unpackedFiles).filter(([path]) => /^Workflows\/.*\.json$/i.test(path))
  if (jsonFiles.length !== 2) throw new Error('PAC roundtrip did not preserve exactly two workflow JSON files')
  for (const [name, expected] of Object.entries(expectedWorkflows)) {
    const found = jsonFiles.find(([path]) => path.toLowerCase().includes(reminderWorkflowIds[name]))
    if (!found || !isDeepStrictEqual(JSON.parse(found[1]), expected)) throw new Error(`PAC roundtrip changed workflow ${name}`)
  }
  const xml = Object.entries(unpackedFiles).filter(([path]) => /\.xml$/i.test(path)).map(([, content]) => content).join('\n')
  if (!/<Managed>0<\/Managed>/.test(xml)) throw new Error('PAC roundtrip lost unmanaged state')
  for (const id of Object.values(reminderWorkflowIds)) {
    const workflow = new RegExp(`<Workflow\\b[^>]*WorkflowId="\\{${id}\\}"[^>]*>[\\s\\S]*?<\\/Workflow>`, 'i').exec(xml)?.[0]
    if (!workflow || !/<StateCode>0<\/StateCode>/.test(workflow) || !/<StatusCode>1<\/StatusCode>/.test(workflow)) throw new Error('PAC roundtrip lost Draft/Off workflow state')
  }
  for (const logicalName of Object.values(reminderSolutionConnectionReferences)) if (!xml.includes(`connectionreferencelogicalname="${logicalName}"`)) throw new Error('PAC roundtrip lost a wizard connection reference')
  return true
}

export async function packReminderSolution({ bindings, pacPath, outputDirectory = resolve(repositoryRoot, 'integrations/power-automate/reminders/local-solution'), runPac = pacLocal }) {
  // Validate before PAC or any output mutation. This mode rejects embedded IDs.
  createReminderWorkflowResources(bindings, { testOnly: true, connectionMode: 'solution' })
  if (typeof pacPath !== 'string' || !pacPath) throw new Error('An explicit local PAC executable path is required')
  await mkdir(outputDirectory, { recursive: true })
  const runDirectory = await mkdtemp(join(outputDirectory, 'Run'))
  const projectDirectory = join(runDirectory, reminderSolutionName)
  await runPac(pacPath, ['solution', 'init', '--publisher-name', 'DrehpunktReminders', '--publisher-prefix', 'dpr', '--outputDirectory', projectDirectory])
  const sourceDirectory = join(projectDirectory, 'src')
  const { files, workflows } = createReminderSolutionAssets(bindings, {
    solutionXmlTemplate: await readFile(join(sourceDirectory, 'Other/Solution.xml'), 'utf8'),
    customizationsXmlTemplate: await readFile(join(sourceDirectory, 'Other/Customizations.xml'), 'utf8'),
  })
  for (const [relative, content] of Object.entries(files)) {
    const target = join(sourceDirectory, relative)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, content, 'utf8')
  }
  const zipPath = join(runDirectory, `${reminderSolutionName}_${reminderSolutionVersion.replaceAll('.', '_')}_unmanaged.zip`)
  await runPac(pacPath, ['solution', 'pack', '--folder', sourceDirectory, '--packagetype', 'Unmanaged', '--zipfile', zipPath])
  const roundtripDirectory = join(runDirectory, 'Roundtrip')
  await runPac(pacPath, ['solution', 'unpack', '--folder', roundtripDirectory, '--packagetype', 'Unmanaged', '--zipfile', zipPath])
  verifyReminderSolutionRoundtrip(await readTree(roundtripDirectory), workflows)
  const manifest = {
    artifactType: 'LOCAL_UNMANAGED_REMINDER_SOLUTION_CANDIDATE', solutionName: reminderSolutionName, version: reminderSolutionVersion,
    workflowIds: reminderWorkflowIds, connectionReferences: reminderSolutionConnectionReferences,
    stateCode: 0, statusCode: 1, jsonState: 'Stopped', testOnly: true,
    localPacPackUnpackVerified: true, cloudImportValidated: false, cloudActivated: false,
    importGates: ['Use permitted browser solution import; never alter Conditional Access or acquire unauthorized credentials.', 'Map both new dpr connection references to the authorized existing df Outlook and SharePoint connections in the UI.', 'Keep import activation off. Verify BOTH flows are Off/Draft after import before any deliberate approved test activation.', 'PublishWorkflows=false only covers classic workflows; do not treat it as a cloud-flow off guarantee.', 'Verify Title required/indexed/EnforceUniqueValues plus list ACLs before any test.', 'Only bb@brennpunkt-logistik.de, no-reply@brennpunkt-logistik.de and df@brennpunkt-logistik.de are permitted test recipients. No recipient redirection.', 'Do not change app/Firebase/general mail flow/secrets through this package.'],
    sources: ['https://github.com/microsoft/Industry-Links/blob/main/scripts/modules/MsIndustryLinks/package/powerPlatformSolution/PackageWorkflows.psm1', 'https://learn.microsoft.com/en-us/power-automate/manage-flows-with-code', 'https://learn.microsoft.com/en-us/power-automate/import-flow-solution', 'https://learn.microsoft.com/en-us/power-platform/developer/cli/reference/solution', 'https://github.com/microsoft/CopilotStudioSamples/blob/main/infrastructure/manage-paygo/sourcecode/Workflows/PollCostandUnlinkEnvironments-AE89C8E6-2544-F111-BEC7-7C1E520AA4DF.json'],
  }
  await writeFile(join(runDirectory, 'local-package-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return { zipPath, sourceDirectory, roundtripDirectory, manifest }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2)
    const options = {}
    while (args.length) {
      const option = args.shift()
      if (!['--bindings', '--pac', '--output-dir'].includes(option) || !args[0] || options[option]) throw new Error('Usage: node scripts/prepare-reminder-solution.mjs --bindings <local.json> --pac <local-pac.exe> [--output-dir <local-directory>]')
      options[option] = args.shift()
    }
    if (!options['--bindings'] || !options['--pac']) throw new Error('Both --bindings and --pac are required; no cloud/auth/import operation is supported')
    const bindings = JSON.parse(await readFile(resolve(options['--bindings']), 'utf8'))
    const result = await packReminderSolution({ bindings, pacPath: resolve(options['--pac']), ...(options['--output-dir'] ? { outputDirectory: resolve(options['--output-dir']) } : {}) })
    console.log(`Local unmanaged solution packed and unpacked: ${result.zipPath}\nBoth flows Draft/Off, testOnly=true. Cloud import/activation not validated or performed.`)
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
