import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as contract from '../functions/reminderProviderContract.js'
import { createReminderFlowPlans, reminderFlowCallers } from './prepare-reminder-flows.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultOutput = resolve(root, 'integrations/power-automate/reminders/local-workflows')
const guid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const statuses = ['Succeeded', 'Failed', 'TimedOut', 'Skipped']
const secure = { secureData: { properties: ['inputs', 'outputs'] } }
const secureInputs = { secureData: { properties: ['inputs'] } }
const b = name => `triggerBody()?['${name}']`
const success = name => ({ [name]: ['Succeeded'] })
const condition = (expression, actions, otherwise = {}, runAfter = {}) => ({ type: 'If', expression, actions, else: { actions: otherwise }, runAfter })
const scope = (actions, runAfter = {}) => ({ type: 'Scope', actions, runAfter })
const setVariable = (name, value, runAfter = {}) => ({ type: 'SetVariable', inputs: { name, value }, runAfter })

/** Only identifiers, never endpoint credentials, may be supplied here. */
export function validateReminderWorkflowBindings(value, { requireConnections = true } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Fixed workflow bindings are required')
  const allowed = ['outlookConnectionId', 'sharePointConnectionId', 'siteUrl', 'developmentListId', 'productionListId', 'developmentServicePrincipalId', 'productionServicePrincipalId']
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error('Unsupported binding field; never supply credentials or callback URLs')
  for (const name of ['outlookConnectionId', 'sharePointConnectionId']) {
    if (!requireConnections) {
      if (Object.hasOwn(value, name)) throw new Error('Solution mode resolves connections in the import wizard; do not supply embedded connection IDs')
    } else if (typeof value[name] !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{5,199}$/.test(value[name])) throw new Error(`Missing/invalid fixed ${name}: use the existing connection name, not an endpoint or access token`)
  }
  let site
  try { site = new URL(value.siteUrl) } catch { throw new Error('Missing/invalid fixed SharePoint siteUrl') }
  if (site.protocol !== 'https:' || !/^[a-zA-Z0-9-]+\.sharepoint\.com$/.test(site.hostname) || site.username || site.password || site.search || site.hash || !/^\/(?:sites|teams)\/[^/]+\/?$/.test(site.pathname)) throw new Error('Use a fixed HTTPS SharePoint Online /sites/name or /teams/name URL without credentials/query')
  for (const name of ['developmentListId', 'productionListId']) if (typeof value[name] !== 'string' || !guid.test(value[name])) throw new Error(`Missing/invalid fixed ${name}`)
  if (value.developmentListId.toLowerCase() === value.productionListId.toLowerCase()) throw new Error('Development and production ledger lists must be distinct')
  for (const environment of ['development', 'production']) {
    const name = `${environment}ServicePrincipalId`
    if (typeof value[name] !== 'string' || !guid.test(value[name]) || value[name].toLowerCase() !== reminderFlowCallers[environment].servicePrincipalId) throw new Error(`Missing or unregistered ${name}: require the registered service-principal object ID, not client ID or tenant access`)
  }
  return { ...value, siteUrl: site.href.replace(/\/$/, ''), developmentListId: value.developmentListId.toLowerCase(), productionListId: value.productionListId.toLowerCase(), developmentServicePrincipalId: value.developmentServicePrincipalId.toLowerCase(), productionServicePrincipalId: value.productionServicePrincipalId.toLowerCase() }
}

function hexExpression(value) {
  const stripped = [...'0123456789abcdef'].reduce((expression, digit) => `replace(${expression},'${digit}','')`, value)
  return `and(equals(length(${value}),64),equals(${stripped},''))`
}

// Native Power Automate publish rejects regex schema keywords when connectors
// are present. The generated WDL performs their checks explicitly before claim.
function connectorCompatibleSchema(value) {
  if (Array.isArray(value)) return value.map(connectorCompatibleSchema)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).filter(([key]) => !['pattern', 'patternProperties'].includes(key)).map(([key, child]) => [key, connectorCompatibleSchema(child)]))
}

function rejection(prefix, statusCode) {
  return {
    [`${prefix}_outcome`]: setVariable('outcome', 'rejected'),
    [`${prefix}_code`]: setVariable('responseCode', statusCode, success(`${prefix}_outcome`)),
  }
}

function connector(api, operationId, parameters, runAfter = {}) {
  return {
    type: 'OpenApiConnection',
    inputs: { parameters, host: { apiId: `/providers/Microsoft.PowerApps/apis/${api}`, connectionName: api, operationId }, authentication: "@parameters('$authentication')", retryPolicy: { type: 'none' } },
    runtimeConfiguration: secure, runAfter,
  }
}

export const reminderSolutionConnectionReferences = Object.freeze({ shared_office365: 'dpr_reminders_sharedoffice365', shared_sharepointonline: 'dpr_reminders_sharedsharepointonline' })

export function createReminderWorkflowResources(rawBindings, { testOnly = true, connectionMode = 'embedded' } = {}) {
  if (typeof testOnly !== 'boolean') throw new Error('testOnly must be an explicit boolean')
  if (!['embedded', 'solution'].includes(connectionMode)) throw new Error('Unknown workflow connection mode')
  const bindings = validateReminderWorkflowBindings(rawBindings, { requireConnections: connectionMode === 'embedded' })
  const plans = createReminderFlowPlans(contract)
  return Object.fromEntries(Object.entries(plans).map(([name, plan]) => {
    const { environment, projectId, sender, contractVersion } = plan.target
    const listId = environment === 'development' ? bindings.developmentListId : bindings.productionListId
    const nodes = Object.fromEntries(plan.nodes.map(node => [node.id, node]))
    const common = { dataset: bindings.siteUrl, table: listId }
    const sp = (operationId, parameters, runAfter = {}) => connector('shared_sharepointonline', operationId, { ...common, ...parameters }, runAfter)
    const ledgerIdentity = { 'item/Title': `@${b('deliveryKey')}`, 'item/DeliveryId': `@${b('deliveryId')}`, 'item/PayloadDigest': `@${b('payloadDigest')}`, 'item/DueAt': `@${b('dueAt')}`, 'item/ExpiresAt': `@${b('expiresAt')}` }
    const update = (outcome, after) => sp('PatchItem', {
      id: "@body('Create_claim')?['ID']", ...ledgerIdentity, 'item/Outcome/Value': outcome, 'item/OutcomeAt': '@utcNow()',
    }, success(after))
    const checkWindow = nodes.check_before_send.expression
    const send = connector('shared_office365', 'SharedMailboxSendEmailV2', {
      'emailMessage/MailboxAddress': sender, 'emailMessage/To': `@${b('to')}`, 'emailMessage/Subject': `@${b('subject')}`, 'emailMessage/Body': `@${b('messageHtml')}`,
    })
    const sendBranch = {
      Send_reminder: send,
      Store_accepted: update('accepted', 'Send_reminder'),
      Accepted_outcome: setVariable('outcome', 'accepted', success('Store_accepted')),
      Store_uncertain: sp('PatchItem', { id: "@body('Create_claim')?['ID']", ...ledgerIdentity, 'item/Outcome/Value': 'uncertain', 'item/OutcomeAt': '@utcNow()' }, { Send_reminder: ['Failed', 'TimedOut'] }),
    }
    const missedBranch = {
      Store_missed: sp('PatchItem', { id: "@body('Create_claim')?['ID']", ...ledgerIdentity, 'item/Outcome/Value': 'missed', 'item/OutcomeAt': '@utcNow()' }),
      Missed_after_claim: setVariable('outcome', 'missed', success('Store_missed')),
    }
    const duplicateBranch = {
      Read_duplicate: sp('GetItems', { '$filter': nodes.read_duplicate.parameters.$filter, '$top': 2 }),
      Check_duplicate_count: condition("@equals(length(body('Read_duplicate')?['value']),1)", {
        Check_duplicate_receipt: condition(nodes.guard_duplicate_receipt.expression.replaceAll('read_duplicate', 'Read_duplicate'), {
          Duplicate_accepted_outcome: setVariable('outcome', 'accepted'),
        }),
      }, {}, success('Read_duplicate')),
    }
    const claimBranch = {
      Attempt_claim: scope({
        Create_claim: sp('PostItem', Object.fromEntries(Object.entries(nodes.create_claim.parameters.item).map(([key, value]) => [key === 'Outcome' ? 'item/Outcome/Value' : `item/${key}`, value]))),
      }),
      Claim_succeeded: condition("@greater(int(coalesce(body('Create_claim')?['ID'],0)),0)", {
        Check_immediately_before_send: condition(checkWindow, sendBranch, missedBranch),
      }, {}, success('Attempt_claim')),
      Claim_failed_read_only: scope({ Check_claim_not_timed_out: condition("@not(equals(actions('Create_claim')?['status'],'TimedOut'))", duplicateBranch) }, { Attempt_claim: ['Failed'] }),
    }
    const identityExpression = `@and(equals(${b('contractVersion')},${contractVersion}),equals(${b('projectId')},'${projectId}'),equals(${b('environment')},'${environment}'),equals(${b('from')},'${sender}'),equals(${b('type')},'central_reminder'),equals(${b('deliveryKey')},concat('${projectId}:',${b('deliveryId')})),equals(coalesce(triggerOutputs()?['headers']?['Idempotency-Key'],triggerOutputs()?['headers']?['idempotency-key']),${b('deliveryKey')}))`
    // Match the backend email regex's complete ECMAScript \s set, not only space
    // and newline. No wildcard/regex capability is assumed in the WDL runtime.
    const whitespace = [9, 10, 11, 12, 13, 32, 160, 5760, ...Array.from({ length: 11 }, (_, index) => 8192 + index), 8232, 8233, 8239, 8287, 12288, 65279].map(value => String.fromCodePoint(value))
    const forbiddenTo = ['<', '>', '(', ')', ',', ';', ':', ...whitespace]
    const noToCharacters = forbiddenTo.map(character => {
      const value = whitespace.includes(character) ? `decodeUriComponent('${encodeURIComponent(character)}')` : `'${character}'`
      return `not(contains(${b('to')},${value}))`
    })
    const domain = `last(split(${b('to')},'@'))`
    const contentExpression = `@and(${hexExpression(b('deliveryId'))},${hexExpression(b('payloadDigest'))},endsWith(${b('dueAt')},'Z'),endsWith(${b('expiresAt')},'Z'),equals(length(split(${b('to')},'@')),2),greater(length(first(split(${b('to')},'@'))),0),greater(lastIndexOf(${domain},'.'),0),less(lastIndexOf(${domain},'.'),sub(length(${domain}),1)),${noToCharacters.join(',')},greater(length(trim(${b('subject')})),0),lessOrEquals(length(${b('subject')}),1000),not(contains(${b('subject')},decodeUriComponent('%0A'))),not(contains(${b('subject')},decodeUriComponent('%0D'))),greater(length(trim(${b('message')})),0),lessOrEquals(length(${b('message')}),40000),greater(length(trim(${b('messageHtml')})),0),lessOrEquals(length(${b('messageHtml')}),200000))`
    const parseTime = {
      Parse_time: { type: 'Compose', inputs: { durationTicks: `@sub(ticks(${b('expiresAt')}),ticks(${b('dueAt')}))`, dueCanonical: `@formatDateTime(${b('dueAt')},'yyyy-MM-ddTHH:mm:ss.fffZ')`, expiresCanonical: `@formatDateTime(${b('expiresAt')},'yyyy-MM-ddTHH:mm:ss.fffZ')` }, runtimeConfiguration: secureInputs, runAfter: {} },
      Invalid_time: scope(rejection('Invalid_time', 422), { Parse_time: ['Failed', 'TimedOut'] }),
      Check_duration: condition(`@and(equals(outputs('Parse_time')?['durationTicks'],600000000),equals(outputs('Parse_time')?['dueCanonical'],${b('dueAt')}),equals(outputs('Parse_time')?['expiresCanonical'],${b('expiresAt')}),equals(mod(ticks(${b('dueAt')}),600000000),0),lessOrEquals(ticks(${b('dueAt')}),ticks(utcNow())))`, {
        Mark_request_valid: setVariable('requestValid', true),
      }, rejection('Invalid_duration', 422), success('Parse_time')),
    }
    const main = {
      Parse_request: { type: 'ParseJson', inputs: { content: '@triggerBody()', schema: connectorCompatibleSchema(plan.requestSchema) }, runtimeConfiguration: secureInputs, runAfter: {} },
      Malformed_request: scope(rejection('Malformed_request', 422), { Parse_request: ['Failed', 'TimedOut'] }),
      Check_identity: condition(identityExpression, {
        Check_test_recipient: condition("@or(equals(parameters('testOnly'),false),contains(createArray('bb@brennpunkt-logistik.de','no-reply@brennpunkt-logistik.de','df@brennpunkt-logistik.de'),toLower(triggerBody()?['to'])))", {
          Check_content: condition(contentExpression, parseTime, rejection('Invalid_content', 422)),
        }, rejection('Test_recipient_not_authorized', 403)),
      }, rejection('Wrong_target', 403), success('Parse_request')),
    }
    const definition = {
      $schema: 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#', contentVersion: '1.0.0.0',
      parameters: { $authentication: { defaultValue: {}, type: 'SecureObject' }, $connections: { defaultValue: {}, type: 'Object' }, testOnly: { defaultValue: testOnly, type: 'Bool' } },
      triggers: { manual: { type: 'Request', kind: 'Http', inputs: { method: 'POST', schema: { type: 'object' }, triggerAuthenticationType: 'User', triggerAllowedUsers: bindings[`${environment}ServicePrincipalId`] }, runtimeConfiguration: secure } },
      actions: {
        Initialize_outcome: { type: 'InitializeVariable', inputs: { variables: [{ name: 'outcome', type: 'string', value: 'uncertain' }] }, runAfter: {} },
        Initialize_response_code: { type: 'InitializeVariable', inputs: { variables: [{ name: 'responseCode', type: 'integer', value: 200 }] }, runAfter: success('Initialize_outcome') },
        Initialize_request_valid: { type: 'InitializeVariable', inputs: { variables: [{ name: 'requestValid', type: 'boolean', value: false }] }, runAfter: success('Initialize_response_code') },
        Validate_request: scope(main, success('Initialize_request_valid')),
        Dispatch: scope({ Check_request_valid: condition("@equals(variables('requestValid'),true)", {
          Check_before_create: condition(checkWindow, claimBranch, { Missed_before_claim: setVariable('outcome', 'missed') }),
        }) }, { Validate_request: statuses }),
        Respond: { type: 'Response', kind: 'Http', inputs: {
          statusCode: "@variables('responseCode')", headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
          body: { contractVersion, projectId, environment, deliveryId: `@${b('deliveryId')}`, payloadDigest: `@${b('payloadDigest')}`, sender, accepted: "@equals(variables('outcome'),'accepted')", outcome: "@variables('outcome')" },
        }, runtimeConfiguration: secureInputs, runAfter: { Dispatch: statuses } },
      }, outputs: {},
    }
    if (connectionMode === 'solution') {
      function stripRuntimeAuthentication(actions) {
        for (const action of Object.values(actions)) {
          if (action.type === 'OpenApiConnection') delete action.inputs.authentication
          if (action.actions) stripRuntimeAuthentication(action.actions)
          if (action.else) stripRuntimeAuthentication(action.else.actions)
        }
      }
      stripRuntimeAuthentication(definition.actions)
    }
    const connectionReferences = connectionMode === 'solution'
      ? Object.fromEntries(Object.entries(reminderSolutionConnectionReferences).map(([api, logicalName]) => [api, { api: { name: api }, connection: { connectionReferenceLogicalName: logicalName }, runtimeSource: 'embedded' }]))
      : {
        shared_office365: { connectionName: bindings.outlookConnectionId, id: '/providers/Microsoft.PowerApps/apis/shared_office365', source: 'Embedded' },
        shared_sharepointonline: { connectionName: bindings.sharePointConnectionId, id: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline', source: 'Embedded' },
      }
    return [name, { properties: {
      displayName: `Drehpunkt central reminders ${environment}`, state: 'Stopped', definition,
      connectionReferences,
    } }]
  }))
}

export async function prepareReminderWorkflows({ bindings, outputDirectory = defaultOutput, mode }) {
  if (!['write', 'check'].includes(mode)) throw new Error('Only --write or --check local generation is supported')
  const resources = createReminderWorkflowResources(bindings) // Validate everything before creating any file.
  const artifacts = {}
  for (const [name, resource] of Object.entries(resources)) {
    artifacts[`${name}.workflow-definition.json`] = resource.properties.definition
    artifacts[`${name}.create-flow.json`] = resource
  }
  artifacts['manifest.json'] = {
    artifactType: 'POWER_AUTOMATE_WORKFLOW_RESOURCE_CANDIDATE', state: 'Stopped', testOnly: true, contractVersion: contract.reminderProviderContractVersion,
    cloudValidated: false, imported: false, published: false, includesSecrets: false,
    notes: 'Executable WDL and bound CreateFlow resource candidates, not a portal import ZIP or Dataverse solution. Power Automate server validation/Flowchecker and operator review remain required. No API request is executed by this generator.',
    resources: ['dev.create-flow.json', 'production.create-flow.json'],
    requirements: ['Fixed SharePoint internal columns from flow-plan; Title required/indexed/EnforceUniqueValues=true.', 'Both lists distinct, ACL restricted to service identity/operators; no editable/deletable live claims.', 'Fixed Outlook connection is the verified df account with SendAs/FullAccess to the fixed mailbox.', 'Verify connector operation metadata and connectionReferences envelope in target environment before activating.', 'Only approved test recipients in controlled tests; no app/Firebase/secret update by this package.'],
    sources: ['https://learn.microsoft.com/en-us/azure/logic-apps/logic-apps-workflow-actions-triggers', 'https://learn.microsoft.com/en-us/azure/logic-apps/set-up-security-permissions', 'https://learn.microsoft.com/en-us/connectors/sharepoint/', 'https://learn.microsoft.com/en-us/connectors/office365/', 'https://learn.microsoft.com/en-us/power-automate/manage-flows-with-code', 'https://github.com/microsoft/power-platform-skills/blob/main/plugins/power-automate/references/definition-reference.md'],
  }
  for (const [name, value] of Object.entries(artifacts)) {
    const target = resolve(outputDirectory, name)
    const contents = `${JSON.stringify(value, null, 2)}\n`
    if (mode === 'write') { await mkdir(outputDirectory, { recursive: true }); await writeFile(target, contents, 'utf8') }
    else if (await readFile(target, 'utf8') !== contents) throw new Error(`Stale local workflow artifact: ${name}`)
  }
  return Object.keys(artifacts)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2)
    const mode = args.shift()
    if (!['--write', '--check'].includes(mode)) throw new Error('Usage: node scripts/prepare-reminder-workflows.mjs --write|--check --bindings <local.json> [--output-dir <local-directory>]')
    const options = {}
    while (args.length) {
      const name = args.shift()
      if (!['--bindings', '--output-dir'].includes(name) || !args[0] || options[name]) throw new Error('Invalid or duplicate local generator argument')
      options[name] = args.shift()
    }
    if (!options['--bindings']) throw new Error('A local bindings JSON file is required; no unbound executable artifact is generated')
    const bindings = JSON.parse(await readFile(resolve(options['--bindings']), 'utf8'))
    const artifacts = await prepareReminderWorkflows({ bindings, mode: mode.slice(2), ...(options['--output-dir'] ? { outputDirectory: resolve(options['--output-dir']) } : {}) })
    console.log(`Local stopped workflow candidates ${mode === '--write' ? 'generated' : 'checked'} (${artifacts.length} files). No cloud request or mail executed.`)
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
