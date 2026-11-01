import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as contract from '../functions/reminderProviderContract.js'
import { createReminderFlowPlan, createReminderFlowPlans, prepareReminderFlows, reminderFlowCallers } from './prepare-reminder-flows.mjs'

const plans = createReminderFlowPlans(contract)
const byId = plan => Object.fromEntries(plan.nodes.map(node => [node.id, node]))

function paths(plan) {
  const nodes = byId(plan)
  const found = []
  function visit(id, prefix) {
    assert.ok(nodes[id], `missing branch target ${id}`)
    assert.ok(!prefix.includes(id), `unexpected loop ${id}`)
    const path = [...prefix, id]
    if (!nodes[id].next) { found.push(path); return }
    for (const next of Object.values(nodes[id].next)) visit(next, path)
  }
  visit(plan.trigger.next, [])
  return found
}

test('factory is deterministic, pure and explicitly produces non-importable unbound drafts', () => {
  assert.deepEqual(createReminderFlowPlans(contract), plans)
  for (const plan of Object.values(plans)) {
    assert.equal(plan.artifactType, 'NON_IMPORTABLE_POWER_AUTOMATE_IMPLEMENTATION_PLAN')
    assert.match(plan.warning, /No live validation/)
    assert.equal(plan.definition, undefined)
    assert.equal(plan.bindings.httpTriggerUrl, null)
    assert.equal(plan.bindings.sharePoint.siteUrl, null)
    assert.equal(plan.bindings.sharePoint.listId, null)
    assert.equal(plan.bindings.outlookDf.connectionReference, null)
    assert.equal(plan.bindings.verifiedUniqueConflictPredicate, null)
    assert.ok(plan.prePublicationChecks.every(check => check.status === 'pending'))
  }
})

test('namespace/schema/bindings prohibit cross-environment requests and dynamic mailbox selection', () => {
  for (const [name, environment] of [['dev', 'development'], ['production', 'production']]) {
    const plan = plans[name]
    const projectId = contract.reminderProviderTargets[environment].projectId
    assert.equal(plan.target.environment, environment)
    assert.equal(plan.target.projectId, projectId)
    assert.deepEqual(plan.requestSchema.properties.environment.enum, [environment])
    assert.deepEqual(plan.requestSchema.properties.projectId.enum, [projectId])
    assert.equal(plan.trigger.authentication.triggerAuthenticationType, 'User')
    assert.equal(plan.trigger.authentication.triggerAllowedUsers, reminderFlowCallers[environment].servicePrincipalId)
    const keyPattern = new RegExp(plan.requestSchema.properties.deliveryKey.pattern)
    assert.ok(keyPattern.test(`${projectId}:${'a'.repeat(64)}`))
    const other = name === 'dev' ? plans.production : plans.dev
    assert.ok(!keyPattern.test(`${other.target.projectId}:${'a'.repeat(64)}`))
    assert.match(byId(plan).guard_identity.expression, /Idempotency-Key/)
    assert.ok(byId(plan).guard_identity.expression.includes(`concat('${projectId}:',`))
    assert.equal(byId(plan).send_mail.parameters.emailMessage.MailboxAddress, contract.reminderSenderAddress)
    assert.equal(plan.bindings.outlookDf.expectedAccount, 'df@')
    assert.equal(plan.target.secretName, 'POWER_AUTOMATE_REMINDER_URL')
    assert.match(plan.target.existingGeneralFlow, /unchanged/i)
  }
  assert.throws(() => createReminderFlowPlan({ environment: 'development', projectId: 'db-bpl-drehpunkt', sender: contract.reminderSenderAddress, contractVersion: 1 }), /Cross-environment/)
  assert.throws(() => createReminderFlowPlan({ environment: 'staging', projectId: 'db-bpl-drehpunkt-dev', sender: contract.reminderSenderAddress, contractVersion: 1 }), /Invalid/)
})

test('required unique indexed Title owns namespaced key; ledger contains no recipient or mail content', () => {
  for (const plan of Object.values(plans)) {
    assert.deepEqual(plan.ledger.columns.Title, { type: 'Text', required: true, indexed: true, enforceUniqueValues: true, source: 'deliveryKey' })
    const nodes = byId(plan)
    assert.equal(nodes.create_claim.operationId, 'PostItem')
    assert.equal(nodes.create_claim.parameters.item.Title, "@triggerBody()?['deliveryKey']")
    assert.equal(nodes.create_claim.parameters.item.Outcome, 'sending')
    assert.equal(nodes.read_duplicate.parameters.$top, 2)
    assert.match(nodes.read_duplicate.parameters.$filter, /Title eq/)
    for (const node of plan.nodes.filter(node => node.connector === 'shared_sharepointonline')) {
      assert.equal(node.parameters.dataset, null)
      assert.equal(node.parameters.table, null)
      assert.doesNotMatch(JSON.stringify(node.parameters), /\['(?:to|from|message|messageHtml|subject)'\]/)
      assert.deepEqual(node.retryPolicy, { type: 'none' })
    }
    assert.deepEqual(Object.keys(plan.ledger.columns).sort(), ['DeliveryId', 'DueAt', 'ExpiresAt', 'Outcome', 'OutcomeAt', 'PayloadDigest', 'Title'])
  }
})

test('every send path requires a successful create and a fresh direct-predecessor window check', () => {
  for (const plan of Object.values(plans)) {
    const nodes = byId(plan)
    assert.equal(nodes.create_claim.next.succeeded, 'guard_created_id')
    assert.equal(nodes.guard_created_id.next.true, 'check_before_send')
    assert.equal(nodes.check_before_send.next.true, 'send_mail')
    assert.match(nodes.check_before_send.expression, /lessOrEquals\(ticks\(triggerBody\(\)\?\['dueAt'\]\),ticks\(utcNow\(\)\)\)/)
    assert.match(nodes.check_before_send.expression, /less\(ticks\(utcNow\(\)\),ticks\(triggerBody\(\)\?\['expiresAt'\]\)\)/)
    assert.equal(nodes.check_before_create.expression, nodes.check_before_send.expression)
    assert.match(nodes.guard_duration.expression, /600000000/)
    for (const path of paths(plan).filter(path => path.includes('send_mail'))) {
      assert.ok(path.indexOf('check_before_create') < path.indexOf('create_claim'))
      assert.ok(path.indexOf('create_claim') < path.indexOf('guard_created_id'))
      assert.equal(path[path.indexOf('send_mail') - 1], 'check_before_send')
      assert.ok(!path.includes('classify_claim_error'))
      assert.ok(!path.includes('read_duplicate'))
    }
  }
})

test('claim errors and duplicate lookups cannot reach sending; timeout never becomes ownership', () => {
  for (const plan of Object.values(plans)) {
    const nodes = byId(plan)
    assert.equal(nodes.create_claim.next.timedOut, 'reply_uncertain')
    assert.equal(nodes.classify_claim_error.action, 'ImplementationGate')
    assert.equal(nodes.classify_claim_error.next.other, 'reply_uncertain')
    assert.equal(nodes.guard_duplicate_count.next.false, 'reply_uncertain')
    assert.equal(nodes.guard_duplicate_receipt.next.false, 'reply_uncertain')
    assert.match(nodes.guard_duplicate_receipt.expression, /PayloadDigest/)
    assert.match(nodes.guard_duplicate_receipt.expression, /'accepted'/)
    for (const path of paths(plan).filter(path => path.includes('classify_claim_error'))) {
      assert.ok(!path.includes('send_mail'))
      assert.ok(['reply_uncertain', 'reply_duplicate_accepted'].includes(path.at(-1)))
    }
  }
})

test('accepted response only follows durable acceptance or matching historical receipt, never queued/sending', () => {
  for (const plan of Object.values(plans)) {
    const nodes = byId(plan)
    for (const path of paths(plan)) {
      const terminal = nodes[path.at(-1)]
      assert.equal(terminal.action, 'Response')
      assert.equal(terminal.body.accepted, terminal.body.outcome === 'accepted')
      if (terminal.body.accepted) {
        assert.equal(terminal.statusCode, 200)
        if (terminal.id === 'reply_accepted') {
          assert.ok(path.includes('send_mail'))
          assert.equal(path.at(-2), 'store_accepted')
        } else {
          assert.equal(terminal.id, 'reply_duplicate_accepted')
          assert.equal(path.at(-2), 'guard_duplicate_receipt')
          assert.ok(!path.includes('send_mail'))
        }
      }
    }
    for (const update of ['store_accepted', 'store_missed', 'store_uncertain']) {
      assert.equal(nodes[update].next.failed, 'reply_uncertain')
      assert.equal(nodes[update].next.timedOut, 'reply_uncertain')
    }
    assert.equal(nodes.send_mail.next.failed, 'store_uncertain')
    assert.equal(nodes.send_mail.next.timedOut, 'store_uncertain')
  }
})

test('all replies satisfy the actual backend parser or conservatively reject malformed identity', () => {
  for (const plan of Object.values(plans)) {
    const request = contract.buildReminderProviderRequest({ environment: plan.target.environment, recipient: 'test@example.invalid', deliveryId: 'a'.repeat(64), dueAt: '2026-10-31T10:00:00.000Z', subject: 'Title', message: 'Text', messageHtml: '<p>Text</p>' })
    for (const node of plan.nodes.filter(node => node.action === 'Response')) {
      const receipt = { ...node.body }
      if (node.id !== 'reply_malformed') Object.assign(receipt, { deliveryId: request.deliveryId, payloadDigest: request.payloadDigest })
      const result = contract.parseReminderProviderResponse(receipt, request, node.statusCode)
      const expected = node.id === 'reply_malformed' ? 'uncertain' : node.body.outcome === 'rejected' ? 'failed' : node.body.outcome
      assert.equal(result.status, expected, node.id)
    }
  }
})

test('mail uses HTML directly; all sensitive actions are secured and every mutation forbids retries', () => {
  for (const plan of Object.values(plans)) {
    const mail = byId(plan).send_mail
    assert.equal(mail.operationId, 'SharedMailboxSendEmailV2')
    assert.equal(mail.parameters.emailMessage.Body, "@triggerBody()?['messageHtml']")
    assert.deepEqual(mail.retryPolicy, { type: 'none' })
    assert.deepEqual(plan.trigger.secure, { inputs: true, outputs: true })
    for (const node of plan.nodes.filter(node => ['ApiConnection', 'ParseJson', 'Response', 'Compose'].includes(node.action))) assert.deepEqual(node.secure, node.action === 'ApiConnection' ? { inputs: true, outputs: true } : { inputs: true })
    assert.ok(plan.nodes.every(node => !['Delay', 'Until', 'Foreach'].includes(node.action)))
    const schema = plan.requestSchema
    assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort())
    assert.equal(schema.additionalProperties, false)
    assert.equal(schema.properties.subject.maxLength, 1000)
    assert.equal(schema.properties.message.maxLength, 40000)
    assert.equal(schema.properties.messageHtml.maxLength, 200000)
    assert.equal(new RegExp(schema.properties.to.pattern).test('a@example.invalid;b@example.invalid'), false)
  }
})

test('local generator writes deterministic JSON and detects stale artifacts without executing a provider', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'drehpunkt-reminder-plans-'))
  try {
    await assert.rejects(prepareReminderFlows({ mode: 'deploy', outputDirectory: directory, contract }), /local non-importable/)
    await prepareReminderFlows({ mode: 'write', outputDirectory: directory, contract })
    await prepareReminderFlows({ mode: 'check', outputDirectory: directory, contract })
    for (const name of Object.keys(plans)) assert.deepEqual(JSON.parse(await readFile(join(directory, `${name}.flow-plan.json`), 'utf8')), plans[name])
    await writeFile(join(directory, 'dev.flow-plan.json'), '{}\n')
    await assert.rejects(prepareReminderFlows({ mode: 'check', outputDirectory: directory, contract }), /stale/)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
