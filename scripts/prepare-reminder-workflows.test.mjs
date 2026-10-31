import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createReminderWorkflowResources, prepareReminderWorkflows, validateReminderWorkflowBindings } from './prepare-reminder-workflows.mjs'
import { buildReminderProviderRequest, parseReminderProviderResponse } from '../functions/reminderProviderContract.js'
import { reminderFlowCallers } from './prepare-reminder-flows.mjs'

const bindings = { outlookConnectionId: 'shared-office365-local-fixture', sharePointConnectionId: 'shared-sharepoint-local-fixture', siteUrl: 'https://fixture.sharepoint.com/sites/Reminders', developmentListId: '11111111-1111-4111-8111-111111111111', productionListId: '22222222-2222-4222-8222-222222222222', developmentServicePrincipalId: reminderFlowCallers.development.servicePrincipalId, productionServicePrincipalId: reminderFlowCallers.production.servicePrincipalId }
const resources = createReminderWorkflowResources(bindings)
const request = (environment = 'development', patch = {}) => ({ ...buildReminderProviderRequest({ environment, recipient: 'df@brennpunkt-logistik.de', deliveryId: 'a'.repeat(64), dueAt: '2026-10-31T12:00:00.000Z', subject: 'Title', message: 'Plain <text>', messageHtml: '<p>Plain &lt;text&gt;</p>' }), ...patch })

function collect(actions, found = {}) {
  for (const [name, action] of Object.entries(actions)) {
    assert.ok(!found[name], `duplicate action name: ${name}`)
    found[name] = action
    if (action.actions) collect(action.actions, found)
    if (action.else) collect(action.else.actions, found)
  }
  return found
}

// A small test-only interpreter for the actual generated WDL subset. No provider,
// network, authentication or real mail operation is present in this harness.
function expression(value, context) {
  if (typeof value !== 'string' || !value.startsWith('@')) return value
  const source = value.slice(1)
  let offset = 0
  function take() {
    if (source[offset] === "'") {
      offset++
      let text = ''
      while (offset < source.length) {
        if (source[offset] === "'") {
          if (source[offset + 1] === "'") { text += "'"; offset += 2; continue }
          offset++; return text
        }
        text += source[offset++]
      }
      throw new Error('unterminated WDL literal')
    }
    const token = /^[A-Za-z0-9_-]+/.exec(source.slice(offset))?.[0]
    assert.ok(token, `unexpected WDL at ${source.slice(offset)}`)
    offset += token.length
    let result
    if (source[offset] === '(') {
      offset++
      const args = []
      while (source[offset] !== ')') {
        args.push(take())
        if (source[offset] === ',') offset++
        else assert.equal(source[offset], ')')
      }
      offset++
      assert.equal(typeof context[token], 'function', `unsupported expression function ${token}`)
      result = context[token](...args)
    } else if (token === 'true' || token === 'false') result = token === 'true'
    else if (token === 'null') result = null
    else if (/^-?\d+$/.test(token)) result = Number(token)
    else throw new Error(`unexpected WDL identifier ${token}`)
    while (source[offset] === '?' || source[offset] === '[') {
      if (source[offset] === '?') offset++
      assert.equal(source[offset++], '[')
      const key = take()
      assert.equal(source[offset++], ']')
      result = result?.[key]
    }
    return result
  }
  const result = take()
  assert.equal(offset, source.length, `unparsed WDL: ${source.slice(offset)}`)
  return result
}

function validateSchema(value, schema) {
  if (schema.type === 'object') {
    assert.equal(typeof value, 'object')
    assert.ok(value && !Array.isArray(value))
    for (const key of schema.required || []) assert.ok(Object.hasOwn(value, key), `missing ${key}`)
    for (const [key, child] of Object.entries(value)) {
      if (schema.properties?.[key]) validateSchema(child, schema.properties[key])
      else assert.notEqual(schema.additionalProperties, false)
    }
  } else if (schema.type === 'integer') assert.ok(Number.isInteger(value))
  else if (schema.type === 'string') {
    assert.equal(typeof value, 'string')
    if (schema.minLength) assert.ok(value.length >= schema.minLength)
    if (schema.maxLength) assert.ok(value.length <= schema.maxLength)
    if (schema.pattern) assert.match(value, new RegExp(schema.pattern))
  }
  if (schema.enum) assert.ok(schema.enum.includes(value))
}

function simulate(resource, payload, { clock = '2026-10-31T12:00:05.000Z', headers = { 'Idempotency-Key': payload.deliveryKey }, create = 'succeeded', duplicate = [], send = 'succeeded', acceptedWrite = 'succeeded', expireAfterClaim = false, testOnlyOverride } = {}) {
  const definition = resource.properties.definition
  const variables = {}
  const outputs = {}
  const states = {}
  const calls = []
  let currentTime = clock
  let response
  const ticks = value => {
    const milliseconds = Date.parse(value)
    if (!Number.isFinite(milliseconds)) throw new Error('invalid time')
    return milliseconds * 10000 // Epoch constant cancels in subtraction/modulo.
  }
  const context = {
    triggerBody: () => payload, triggerOutputs: () => ({ headers }), variables: name => variables[name], outputs: name => outputs[name], body: name => outputs[name]?.body, actions: name => ({ status: states[name] }),
    parameters: name => name === 'testOnly' && testOnlyOverride !== undefined ? testOnlyOverride : definition.parameters[name]?.defaultValue,
    ticks, utcNow: () => currentTime, sub: (a, b) => a - b, mod: (a, b) => a % b,
    equals: (a, b) => a === b, and: (...args) => args.every(Boolean), or: (...args) => args.some(Boolean), not: value => !value,
    less: (a, b) => a < b, lessOrEquals: (a, b) => a <= b, greater: (a, b) => a > b,
    length: value => value.length, replace: (value, from, to) => value.replaceAll(from, to), concat: (...args) => args.join(''),
    coalesce: (...args) => args.find(value => value != null), int: value => Number(value), first: values => values[0], last: values => values.at(-1),
    endsWith: (value, end) => value.endsWith(end), split: (value, separator) => value.split(separator), contains: (value, part) => value.includes(part), trim: value => value.trim(), toLower: value => value.toLowerCase(),
    decodeUriComponent: decodeURIComponent, createArray: (...args) => args,
  }
  function resolve(value) {
    if (Array.isArray(value)) return value.map(resolve)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, resolve(child)]))
    return expression(value, context)
  }
  function execute(actions) {
    const local = {}
    for (const [name, action] of Object.entries(actions)) {
      if (Object.entries(action.runAfter || {}).some(([prior, allowed]) => !allowed.includes(local[prior]))) { local[name] = states[name] = 'Skipped'; continue }
      let status = 'Succeeded'
      try {
        if (action.type === 'InitializeVariable') for (const variable of action.inputs.variables) variables[variable.name] = variable.value
        else if (action.type === 'SetVariable') variables[action.inputs.name] = resolve(action.inputs.value)
        else if (action.type === 'Scope') { if (Object.values(execute(action.actions)).some(state => ['Failed', 'TimedOut'].includes(state))) status = 'Failed' }
        else if (action.type === 'If') { if (Object.values(execute(expression(action.expression, context) ? action.actions : action.else.actions)).some(state => ['Failed', 'TimedOut'].includes(state))) status = 'Failed' }
        else if (action.type === 'ParseJson') { const content = resolve(action.inputs.content); validateSchema(content, action.inputs.schema); outputs[name] = { body: content } }
        else if (action.type === 'Compose') outputs[name] = resolve(action.inputs)
        else if (action.type === 'Response') response = resolve(action.inputs)
        else if (action.type === 'OpenApiConnection') {
          const parameters = resolve(action.inputs.parameters)
          calls.push({ name, parameters, operationId: action.inputs.host.operationId })
          if (name === 'Create_claim') {
            if (create !== 'succeeded') status = create === 'timedOut' ? 'TimedOut' : 'Failed'
            else { outputs[name] = { body: { ID: 123 } }; if (expireAfterClaim) currentTime = '2026-10-31T12:01:00.000Z' }
          } else if (name === 'Read_duplicate') outputs[name] = { body: { value: duplicate } }
          else if (name === 'Send_reminder' && send !== 'succeeded') status = send === 'timedOut' ? 'TimedOut' : 'Failed'
          else if (name === 'Store_accepted' && acceptedWrite !== 'succeeded') status = 'Failed'
        } else throw new Error(`unsupported action ${action.type}`)
      } catch { status = 'Failed' }
      local[name] = states[name] = status
    }
    return local
  }
  execute(definition.actions)
  return { response, calls, states, result: response && parseReminderProviderResponse(response.body, payload, response.statusCode), sends: calls.filter(call => call.name === 'Send_reminder') }
}

test('no executable files can be generated with missing, unsafe, same-list or cross-binding inputs', async () => {
  for (const patch of [{ outlookConnectionId: null }, { sharePointConnectionId: null }, { siteUrl: null }, { developmentListId: null }, { productionListId: null }, { productionListId: bindings.developmentListId }, { siteUrl: 'https://fixture.sharepoint.com/sites/A?token=secret' }, { siteUrl: 'https://other.invalid/sites/A' }, { token: 'do-not-accept' }, { outlookConnectionId: 'https://endpoint.invalid/?sig=secret' }]) assert.throws(() => validateReminderWorkflowBindings({ ...bindings, ...patch }))
  assert.throws(() => createReminderWorkflowResources(bindings, { testOnly: 'false' }))
  const directory = await mkdtemp(join(tmpdir(), 'drehpunkt-workflow-bindings-'))
  try {
    await assert.rejects(prepareReminderWorkflows({ mode: 'write', bindings: {}, outputDirectory: directory }))
    assert.deepEqual(await readdir(directory), [])
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('resources use real WDL control/connector envelopes, fixed bindings and stopped test defaults', () => {
  for (const [name, resource] of Object.entries(resources)) {
    const { definition, connectionReferences } = resource.properties
    assert.equal(resource.properties.state, 'Stopped')
    assert.equal(definition.parameters.testOnly.defaultValue, true)
    assert.match(definition.$schema, /workflowdefinition\.json#$/)
    assert.equal(definition.triggers.manual.type, 'Request')
    assert.equal(definition.triggers.manual.kind, 'Http')
    assert.equal(definition.triggers.manual.inputs.triggerAuthenticationType, 'User')
    assert.equal(definition.triggers.manual.inputs.triggerAllowedUsers, name === 'dev' ? bindings.developmentServicePrincipalId : bindings.productionServicePrincipalId)
    const nodes = collect(definition.actions)
    function validateTree(actions, depth = 0) {
      assert.ok(depth <= 8, `Power Automate nesting exceeds 8 at depth ${depth}`)
      const names = new Set(Object.keys(actions))
      for (const node of Object.values(actions)) {
        for (const [prior, allowed] of Object.entries(node.runAfter)) {
          assert.ok(names.has(prior), `runAfter dependency is not a sibling: ${prior}`)
          assert.ok(allowed.every(status => ['Succeeded', 'Failed', 'TimedOut', 'Skipped'].includes(status)))
        }
        if (node.expression) assert.ok(node.expression.length <= 8192)
        if (node.actions) validateTree(node.actions, depth + 1)
        if (node.else) validateTree(node.else.actions, depth + 1)
      }
    }
    validateTree(definition.actions)
    for (const action of Object.values(nodes).filter(node => ['Compose', 'ParseJson', 'Response'].includes(node.type))) assert.deepEqual(action.runtimeConfiguration.secureData.properties, ['inputs'])
    assert.equal(Object.values(nodes).filter(node => node.type === 'Response').length, 1)
    assert.deepEqual(nodes.Respond.runAfter.Dispatch, ['Succeeded', 'Failed', 'TimedOut', 'Skipped'])
    assert.equal(nodes.Initialize_outcome.inputs.variables[0].value, 'uncertain')
    for (const node of Object.values(nodes).filter(node => node.type === 'OpenApiConnection')) {
      const { host, parameters } = node.inputs
      assert.ok(connectionReferences[host.connectionName])
      assert.equal(connectionReferences[host.connectionName].id, host.apiId)
      assert.deepEqual(node.inputs.retryPolicy, { type: 'none' })
      assert.deepEqual(node.runtimeConfiguration.secureData.properties, ['inputs', 'outputs'])
      if (host.operationId === 'SharedMailboxSendEmailV2') {
        assert.equal(parameters['emailMessage/MailboxAddress'], 'drehpunkt@brennpunkt-logistik.de')
        assert.equal(parameters['emailMessage/Body'], "@triggerBody()?['messageHtml']")
        assert.ok(!Object.keys(parameters).some(key => /Cc|Bcc/.test(key)))
      } else {
        assert.equal(parameters.dataset, bindings.siteUrl)
        assert.equal(parameters.table, name === 'dev' ? bindings.developmentListId : bindings.productionListId)
        assert.ok(!JSON.stringify(parameters).includes("['to']"))
        assert.ok(!Object.keys(parameters).includes('item'))
        if (['PostItem', 'PatchItem'].includes(host.operationId)) {
          for (const field of ['Title', 'DeliveryId', 'PayloadDigest', 'DueAt', 'ExpiresAt', 'Outcome/Value', 'OutcomeAt']) assert.ok(Object.hasOwn(parameters, `item/${field}`), `missing required choice/update field ${field}`)
          assert.equal(Object.hasOwn(parameters, 'item/Outcome'), false)
        }
      }
    }
    assert.equal(connectionReferences.shared_office365.connectionName, bindings.outlookConnectionId)
    assert.equal(connectionReferences.shared_sharepointonline.connectionName, bindings.sharePointConnectionId)
  }
})

test('caller bindings cannot disappear, use client IDs, swap environments or widen to arbitrary GUIDs', () => {
  for (const patch of [{ developmentServicePrincipalId: undefined }, { productionServicePrincipalId: null }, { developmentServicePrincipalId: reminderFlowCallers.development.clientId }, { productionServicePrincipalId: reminderFlowCallers.production.clientId }, { developmentServicePrincipalId: bindings.productionServicePrincipalId }, { productionServicePrincipalId: bindings.developmentServicePrincipalId }, { developmentServicePrincipalId: '33333333-3333-4333-8333-333333333333' }, { productionServicePrincipalId: '' }]) assert.throws(() => createReminderWorkflowResources({ ...bindings, ...patch }), /registered/)
})

test('successful actual WDL path sends HTML once and acknowledges only after durable accepted update', () => {
  for (const [name, environment] of [['dev', 'development'], ['production', 'production']]) {
    const run = simulate(resources[name], request(environment))
    assert.equal(run.sends.length, 1)
    assert.deepEqual(run.result, { status: 'accepted' })
    assert.deepEqual(run.calls.map(call => call.name), ['Create_claim', 'Send_reminder', 'Store_accepted'])
    assert.equal(run.calls[0].parameters['item/Title'], request(environment).deliveryKey)
    assert.equal(run.calls[0].parameters['item/Outcome/Value'], 'sending')
    assert.equal(run.calls[2].parameters['item/Outcome/Value'], 'accepted')
    assert.equal(run.sends[0].parameters['emailMessage/To'], 'df@brennpunkt-logistik.de')
    assert.equal(run.response.body.environment, environment)
  }
})

test('cross-environment, unsafe keys, unexpected header and unauthorized test recipients never acquire a claim', () => {
  const cases = [
    [request('production'), {}], [request('development', { deliveryKey: "x' or 1 eq 1" }), {}],
    [request(), { headers: { 'Idempotency-Key': 'wrong' } }],
    [request('development', { to: 'other@brennpunkt-logistik.de' }), {}],
    [request('development', { Cc: 'df@brennpunkt-logistik.de' }), {}],
    [request('development', { payloadDigest: 'X'.repeat(64) }), {}],
  ]
  for (const [payload, options] of cases) {
    const run = simulate(resources.dev, payload, options)
    assert.equal(run.calls.length, 0)
    assert.equal(run.response.body.outcome, 'rejected')
    assert.equal(run.response.body.accepted, false)
  }
  const lowercaseHeader = simulate(resources.dev, request(), { headers: { 'idempotency-key': request().deliveryKey } })
  assert.equal(lowercaseHeader.sends.length, 1)
  for (const to of ['bb@brennpunkt-logistik.de', 'no-reply@brennpunkt-logistik.de', 'df@brennpunkt-logistik.de']) assert.equal(simulate(resources.dev, request('development', { to })).sends.length, 1)
  const normalResource = createReminderWorkflowResources(bindings, { testOnly: false }).dev
  assert.equal(simulate(normalResource, request('development', { to: 'other@example.invalid' })).sends.length, 1)
})

test('expiry rejects catch-up both before claim and directly before sending, including exact boundary', () => {
  const expired = simulate(resources.dev, request(), { clock: '2026-10-31T12:01:00.000Z' })
  assert.equal(expired.calls.length, 0)
  assert.deepEqual(expired.result, { status: 'missed', reason: 'provider-minute-expired' })
  const afterClaim = simulate(resources.dev, request(), { expireAfterClaim: true })
  assert.equal(afterClaim.sends.length, 0)
  assert.deepEqual(afterClaim.calls.map(call => call.name), ['Create_claim', 'Store_missed'])
  assert.equal(afterClaim.calls[1].parameters['item/Outcome/Value'], 'missed')
  assert.equal(afterClaim.result.status, 'missed')
  const tooEarly = simulate(resources.dev, request(), { clock: '2026-10-31T11:59:59.999Z' })
  assert.equal(tooEarly.calls.length, 0)
  assert.equal(tooEarly.result.status, 'failed')
  const invalidDuration = simulate(resources.dev, request('development', { expiresAt: '2026-10-31T12:02:00.000Z' }))
  assert.equal(invalidDuration.calls.length, 0)
  assert.equal(invalidDuration.result.status, 'failed')
})

test('every create failure is read-only afterwards; accepted same-digest duplicate ACKs without sending', () => {
  const payload = request()
  const stored = { Title: payload.deliveryKey, DeliveryId: payload.deliveryId, PayloadDigest: payload.payloadDigest, Outcome: { '@odata.type': '#Microsoft.Azure.Connectors.SharePoint.SPListExpandedReference', Id: 1, Value: 'accepted' } }
  const accepted = simulate(resources.dev, payload, { create: 'failed', duplicate: [stored] })
  assert.equal(accepted.sends.length, 0)
  assert.equal(accepted.result.status, 'accepted')
  assert.deepEqual(accepted.calls.map(call => call.name), ['Create_claim', 'Read_duplicate'])
  for (const duplicate of [[], [stored, stored], [{ ...stored, Outcome: { Value: 'sending' } }], [{ ...stored, Outcome: { Value: 'uncertain' } }], [{ ...stored, Outcome: 'accepted' }], [{ ...stored, Outcome: null }], [{ ...stored, PayloadDigest: 'b'.repeat(64) }], [{ ...stored, Title: `db-bpl-drehpunkt:${payload.deliveryId}` }]]) {
    const run = simulate(resources.dev, payload, { create: 'failed', duplicate })
    assert.equal(run.sends.length, 0)
    assert.equal(run.result.status, 'uncertain')
  }
  const timeout = simulate(resources.dev, payload, { create: 'timedOut', duplicate: [stored] })
  assert.deepEqual(timeout.calls.map(call => call.name), ['Create_claim'])
  assert.equal(timeout.result.status, 'uncertain')
})

test('uncertain send and failed accepted-write cannot yield accepted or a second mail', () => {
  for (const options of [{ send: 'failed' }, { send: 'timedOut' }, { acceptedWrite: 'failed' }]) {
    const run = simulate(resources.dev, request(), options)
    assert.equal(run.sends.length, 1)
    assert.equal(run.result.status, 'uncertain')
    assert.equal(run.response.body.accepted, false)
    if (options.send) assert.equal(run.calls.find(call => call.name === 'Store_uncertain').parameters['item/Outcome/Value'], 'uncertain')
  }
})

test('generated packages contain no unresolved plan DSL, secret URL or enabling action and detect drift', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'drehpunkt-bound-workflows-'))
  try {
    const files = await prepareReminderWorkflows({ mode: 'write', bindings, outputDirectory: directory })
    assert.equal(files.length, 5)
    await prepareReminderWorkflows({ mode: 'check', bindings, outputDirectory: directory })
    const resource = JSON.parse(await readFile(join(directory, 'dev.create-flow.json'), 'utf8'))
    assert.deepEqual(resource, resources.dev)
    const json = JSON.stringify(resource)
    assert.doesNotMatch(json, /ImplementationGate|schemaRef|verifiedUniqueConflictPredicate|signature|sig=|callbackUrl|NON_IMPORTABLE/)
    assert.doesNotMatch(json, /"state":"Started"/)
    const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'))
    assert.equal(manifest.cloudValidated, false)
    assert.equal(manifest.testOnly, true)
    assert.equal(manifest.imported, false)
    await assert.rejects(prepareReminderWorkflows({ mode: 'check', bindings: { ...bindings, productionListId: '33333333-3333-4333-8333-333333333333' }, outputDirectory: directory }), /Stale/)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
