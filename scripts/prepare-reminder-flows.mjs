import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const hex64 = '^[a-f0-9]{64}$'
const utcIso = '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,7})?Z$'
const input = name => `triggerBody()?['${name}']`
const tick = name => `ticks(${input(name)})`
const minuteWindow = `@and(lessOrEquals(${tick('dueAt')},ticks(utcNow())),less(ticks(utcNow()),${tick('expiresAt')}))`
const secure = { inputs: true, outputs: true }
const retry = { type: 'none' }

function stringSchema(extra = {}) { return { type: 'string', minLength: 1, ...extra } }

export function createReminderFlowPlan({ environment, projectId, sender, contractVersion }) {
  if (!['development', 'production'].includes(environment) || !/^db-bpl-drehpunkt(?:-dev)?$/.test(projectId || '') || !sender || contractVersion !== 1) throw new Error('Invalid fixed reminder provider target')
  if ((environment === 'development') !== projectId.endsWith('-dev')) throw new Error('Cross-environment reminder target')
  const requestProperties = {
    contractVersion: { type: 'integer', enum: [contractVersion] },
    projectId: stringSchema({ enum: [projectId] }), environment: stringSchema({ enum: [environment] }),
    deliveryId: stringSchema({ pattern: hex64 }), deliveryKey: stringSchema({ pattern: `^${projectId}:[a-f0-9]{64}$` }),
    payloadDigest: stringSchema({ pattern: hex64 }),
    dueAt: stringSchema({ format: 'date-time', pattern: utcIso }), expiresAt: stringSchema({ format: 'date-time', pattern: utcIso }),
    from: stringSchema({ enum: [sender] }), to: stringSchema({ format: 'email', pattern: '^[^<>(),;:\\s@]+@[^<>(),;:\\s@]+\\.[^<>(),;:\\s@]+$' }), subject: stringSchema({ maxLength: 1000, pattern: '^[^\\r\\n]+$' }),
    message: stringSchema({ maxLength: 40000 }), messageHtml: stringSchema({ maxLength: 200000 }), type: stringSchema({ enum: ['central_reminder'] }),
  }
  const replyIdentity = {
    contractVersion, projectId, environment, deliveryId: `@${input('deliveryId')}`,
    payloadDigest: `@${input('payloadDigest')}`, sender,
  }
  const response = (id, statusCode, outcome, extra = {}) => ({
    id, action: 'Response', statusCode, secure,
    body: { ...replyIdentity, accepted: outcome === 'accepted', outcome }, ...extra,
  })
  const sp = (id, operationId, parameters, next) => ({ id, action: 'ApiConnection', connector: 'shared_sharepointonline', operationId, binding: 'sharePoint', retryPolicy: retry, secure, parameters, next })
  const update = (id, outcome, next) => sp(id, 'PatchItem', {
    dataset: null, table: null, id: "@body('create_claim')?['ID']",
    item: { Title: `@${input('deliveryKey')}`, Outcome: outcome, OutcomeAt: '@utcNow()' },
  }, next)
  const nodes = [
    { id: 'parse_request', action: 'ParseJson', content: '@triggerBody()', schemaRef: 'requestSchema', secure, next: { succeeded: 'guard_identity', failed: 'reply_malformed' } },
    { id: 'guard_identity', action: 'If', expression: `@and(equals(${input('contractVersion')},${contractVersion}),equals(${input('projectId')},'${projectId}'),equals(${input('environment')},'${environment}'),equals(${input('from')},'${sender}'),equals(${input('type')},'central_reminder'),equals(${input('deliveryKey')},concat('${projectId}:',${input('deliveryId')})),equals(triggerOutputs()?['headers']?['Idempotency-Key'],${input('deliveryKey')}))`, next: { true: 'parse_time', false: 'reply_wrong_target' } },
    { id: 'parse_time', action: 'Compose', expression: `@sub(${tick('expiresAt')},${tick('dueAt')})`, secure, next: { succeeded: 'guard_duration', failed: 'reply_rejected' } },
    { id: 'guard_duration', action: 'If', expression: `@and(equals(outputs('parse_time'),600000000),equals(mod(${tick('dueAt')},600000000),0))`, next: { true: 'guard_not_early', false: 'reply_rejected' } },
    { id: 'guard_not_early', action: 'If', expression: `@lessOrEquals(${tick('dueAt')},ticks(utcNow()))`, next: { true: 'check_before_create', false: 'reply_rejected' } },
    { id: 'check_before_create', action: 'If', expression: minuteWindow, next: { true: 'create_claim', false: 'reply_missed' } },
    sp('create_claim', 'PostItem', { dataset: null, table: null, item: { Title: `@${input('deliveryKey')}`, DeliveryId: `@${input('deliveryId')}`, PayloadDigest: `@${input('payloadDigest')}`, Outcome: 'sending', DueAt: `@${input('dueAt')}`, ExpiresAt: `@${input('expiresAt')}`, OutcomeAt: '@utcNow()' } }, { succeeded: 'guard_created_id', failed: 'classify_claim_error', timedOut: 'reply_uncertain' }),
    { id: 'guard_created_id', action: 'If', expression: "@greater(int(coalesce(body('create_claim')?['ID'],0)),0)", next: { true: 'check_before_send', false: 'reply_uncertain', failed: 'reply_uncertain' } },
    { id: 'classify_claim_error', action: 'ImplementationGate', binding: 'verifiedUniqueConflictPredicate', rule: 'Only a verified SharePoint unique-constraint violation may enter duplicate lookup. Unknown failures, throttling, timeout and ambiguous create responses never acquire ownership.', next: { verifiedUniqueConflict: 'read_duplicate', other: 'reply_uncertain' } },
    sp('read_duplicate', 'GetItems', { dataset: null, table: null, '$filter': `@concat('Title eq ',decodeUriComponent('%27'),${input('deliveryKey')},decodeUriComponent('%27'))`, '$top': 2 }, { succeeded: 'guard_duplicate_count', failed: 'reply_uncertain', timedOut: 'reply_uncertain' }),
    { id: 'guard_duplicate_count', action: 'If', expression: "@equals(length(body('read_duplicate')?['value']),1)", next: { true: 'guard_duplicate_receipt', false: 'reply_uncertain' } },
    { id: 'guard_duplicate_receipt', action: 'If', expression: `@and(equals(first(body('read_duplicate')?['value'])?['Title'],${input('deliveryKey')}),equals(first(body('read_duplicate')?['value'])?['DeliveryId'],${input('deliveryId')}),equals(first(body('read_duplicate')?['value'])?['PayloadDigest'],${input('payloadDigest')}),equals(first(body('read_duplicate')?['value'])?['Outcome'],'accepted'))`, next: { true: 'reply_duplicate_accepted', false: 'reply_uncertain' } },
    { id: 'check_before_send', action: 'If', expression: minuteWindow, next: { true: 'send_mail', false: 'store_missed' }, placement: 'Direct predecessor of send_mail; no intervening connector, delay, loop or retry.' },
    { id: 'send_mail', action: 'ApiConnection', connector: 'shared_office365', operationId: 'SharedMailboxSendEmailV2', binding: 'outlookDf', secure, retryPolicy: retry, parameters: { emailMessage: { MailboxAddress: sender, To: `@${input('to')}`, Subject: `@${input('subject')}`, Body: `@${input('messageHtml')}` } }, next: { succeeded: 'store_accepted', failed: 'store_uncertain', timedOut: 'store_uncertain' }, failurePolicy: 'Never infer non-delivery from connector failure. No resend, resubmit or lease reclamation.' },
    update('store_accepted', 'accepted', { succeeded: 'reply_accepted', failed: 'reply_uncertain', timedOut: 'reply_uncertain' }),
    update('store_missed', 'missed', { succeeded: 'reply_missed', failed: 'reply_uncertain', timedOut: 'reply_uncertain' }),
    update('store_uncertain', 'uncertain', { succeeded: 'reply_uncertain', failed: 'reply_uncertain', timedOut: 'reply_uncertain' }),
    response('reply_accepted', 200, 'accepted'), response('reply_duplicate_accepted', 200, 'accepted'),
    response('reply_missed', 200, 'missed'), response('reply_uncertain', 200, 'uncertain'),
    response('reply_rejected', 422, 'rejected'), response('reply_wrong_target', 403, 'rejected'),
    response('reply_malformed', 422, 'rejected', { body: { contractVersion, projectId, environment, deliveryId: null, payloadDigest: null, sender, accepted: false, outcome: 'rejected' }, note: 'Missing/untrusted request identifiers are not echoed; this rejection is not a valid accepted receipt.' }),
  ]
  return {
    artifactType: 'NON_IMPORTABLE_POWER_AUTOMATE_IMPLEMENTATION_PLAN', planVersion: 1,
    warning: 'LOCAL DRAFT ONLY. Not a Power Automate export, ARM template or importable flow. No live validation, publication, connection or mail execution has occurred. Expressions, connector envelopes, schema enforcement and dynamic SharePoint column bindings require target-designer verification.',
    target: { environment, projectId, contractVersion, sender, secretName: 'POWER_AUTOMATE_REMINDER_URL', flowDisplayName: `Drehpunkt central reminders ${environment}`, existingGeneralFlow: 'Leave unchanged' },
    bindings: { httpTriggerUrl: null, sharePoint: { siteUrl: null, listId: null, connectionReference: null }, outlookDf: { connectionReference: null, expectedAccount: 'df@', mailboxAddress: sender }, verifiedUniqueConflictPredicate: null },
    trigger: { id: 'request', action: 'Request', kind: 'Http', method: 'POST', authentication: 'Dedicated secret endpoint per Firebase project; never check in callback URL or SAS token.', secure, schemaRef: 'requestSchema', next: 'parse_request', splitOn: false, concurrency: { degreeOfParallelism: null, policy: 'Choose bounded parallelism after quota review. Concurrency=1 is not the idempotency mechanism; queued runs must still expire.' } },
    requestSchema: { type: 'object', additionalProperties: false, required: Object.keys(requestProperties), properties: requestProperties },
    responseSchema: { type: 'object', additionalProperties: false, required: ['contractVersion', 'projectId', 'environment', 'deliveryId', 'payloadDigest', 'sender', 'accepted', 'outcome'], properties: { ...Object.fromEntries(Object.entries(replyIdentity).map(([key, value]) => [key, key === 'contractVersion' ? { type: 'integer', enum: [value] } : key === 'deliveryId' || key === 'payloadDigest' ? stringSchema({ pattern: hex64 }) : stringSchema({ enum: [value] })])), accepted: { type: 'boolean' }, outcome: { enum: ['accepted', 'missed', 'uncertain', 'rejected'] } }, invariant: 'accepted is true iff outcome is accepted. Malformed-request rejection may have null deliveryId/payloadDigest and is never accepted.' },
    ledger: { fixedPerEnvironment: true, listId: null, columns: { Title: { type: 'Text', required: true, indexed: true, enforceUniqueValues: true, source: 'deliveryKey' }, DeliveryId: { type: 'Text', required: true }, PayloadDigest: { type: 'Text', required: true }, Outcome: { type: 'Choice', required: true, values: ['sending', 'accepted', 'missed', 'uncertain'] }, DueAt: { type: 'DateTime', required: true }, ExpiresAt: { type: 'DateTime', required: true }, OutcomeAt: { type: 'DateTime', required: true } }, forbiddenData: ['email addresses', 'subject', 'message', 'messageHtml', 'notes'], permissions: 'Only dedicated flow service identity and specifically authorized operators; no general member write/edit/delete. Protect claims against mutation, deletion and alternate writers.', retention: 'No automatic claim deletion in this draft. Any later retention policy must preserve replay/expiry guarantees; never delete live or unresolved claims to enable retries.' },
    nodes,
    implementationRequirements: [
      'Preserve each branch and run-after failure route when translating this plan into the designer. ImplementationGate is deliberately unresolved and not a native Power Automate action.',
      'Verify trigger/Parse JSON enforces pattern, enum, additionalProperties and date-time validation; otherwise add equivalent explicit validation before using values in OData or sending. Reject rather than silently bypass validation.',
      'Idempotency-Key header must equal namespaced deliveryKey. HTTP header casing/normalization must be verified in the target trigger.',
      'payloadDigest is SHA-256 of UTF-8 JSON.stringify(request without payloadDigest), in the exact field insertion order defined by functions/reminderProviderContract.js. This plan does not invent a native WDL SHA-256 function or verify canonicalization; secure dedicated endpoint and digest equality fence duplicate receipts. The digest is not authentication.',
      'SharePoint columns use the stated internal names; provision/verify required, indexed, enforced-unique Title before enabling the HTTP flow. Fix site/list GUID and connection refs rather than accepting request bindings.',
      'Create, mail and ledger updates all have retryPolicy none. Read errors fail closed. No child flow, delayed branch or manual resubmission may send from an existing claim.',
      'Accepted ACK follows successful Outlook connector completion AND successful accepted ledger update; accepted does not assert inbox delivery. Ledger failure after mail leaves sending/uncertain permanently and must never cause another mail.',
      'All request/mail/ledger actions and responses use secure inputs/outputs. No mail bodies or addresses in ledger, custom telemetry or failure messages.',
      'A caller abort cannot cancel the provider. utcNow checks prevent starting the mail action outside the requested window, but connector queueing and mailbox delivery are not hard real-time guarantees.',
      'If the run fails outside modeled branches, return no accepted ACK. The backend records uncertainty; operators investigate without retrying the mail.',
    ],
    prePublicationChecks: [
      { check: 'Tenant licenses, HTTP request trigger rights, SharePoint capacity, connector limits and DLP/conditional-access compatibility', status: 'pending' },
      { check: 'Distinct Dev/Prod site-list GUID bindings, dedicated secret URLs and expected project identities', status: 'pending' },
      { check: 'Title required/indexed/EnforceUniqueValues read back; exactly one created item under concurrent same-key requests', status: 'pending' },
      { check: 'Real connector unique-conflict error classified narrowly; all other claim outcomes fail closed', status: 'pending' },
      { check: 'Correct fixed df@ connection and drehpunkt@ mailbox; no dynamic From, HTML fallback, CC or BCC', status: 'pending' },
      { check: 'Designer validates expressions, schema, actual connector parameter envelopes, internal column names, secure IO and retry none', status: 'pending' },
      { check: 'Controlled approved provider acceptance tests: namespace rejection, duplicate, overlap, expired input, timeout and failed accepted-write; never send twice', status: 'pending' },
      { check: 'No publication or live test authorized by this generator; obtain separate release/test authorization', status: 'pending' },
    ],
    sources: [
      'https://learn.microsoft.com/en-us/connectors/sharepoint/',
      'https://support.microsoft.com/en-us/sharepoint/lists/data-and-lists/create-list-relationships-by-using-lookup-columns',
      'https://learn.microsoft.com/en-us/connectors/office365/',
      'https://learn.microsoft.com/en-us/azure/logic-apps/error-exception-handling#none---no-retry-policy',
      'https://learn.microsoft.com/en-us/azure/logic-apps/logic-apps-workflow-actions-triggers#response-action',
    ],
  }
}

export function createReminderFlowPlans({ reminderSenderAddress, reminderProviderContractVersion, reminderProviderTargets }) {
  return Object.fromEntries([['dev', 'development'], ['production', 'production']].map(([name, environment]) => [name, createReminderFlowPlan({ environment, projectId: reminderProviderTargets[environment].projectId, sender: reminderSenderAddress, contractVersion: reminderProviderContractVersion })]))
}

export async function prepareReminderFlows({ mode, outputDirectory = resolve(repositoryRoot, 'integrations/power-automate/reminders'), contract }) {
  if (!['write', 'check'].includes(mode)) throw new Error('Use --write or --check; this command only generates/checks local non-importable drafts')
  const plans = createReminderFlowPlans(contract)
  for (const [name, plan] of Object.entries(plans)) {
    const target = resolve(outputDirectory, `${name}.flow-plan.json`)
    const contents = `${JSON.stringify(plan, null, 2)}\n`
    if (mode === 'write') { await mkdir(dirname(target), { recursive: true }); await writeFile(target, contents, 'utf8') }
    else if (await readFile(target, 'utf8') !== contents) throw new Error(`Local reminder plan is stale: ${name}`)
  }
  return Object.keys(plans)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2)
    if (args.length !== 1 || !['--write', '--check'].includes(args[0])) throw new Error('Usage: node scripts/prepare-reminder-flows.mjs --write|--check (local drafts only)')
    const contract = await import('../functions/reminderProviderContract.js')
    const names = await prepareReminderFlows({ mode: args[0].slice(2), contract })
    console.log(`Local non-importable reminder plans ${args[0] === '--write' ? 'generated' : 'checked'}: ${names.join(', ')}. No flow or mail executed.`)
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
