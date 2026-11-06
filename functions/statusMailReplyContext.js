import { splitMailConversation } from './shared/mailboxConversation.js'

const text = value => typeof value === 'string' ? value : ''
const normalized = value => text(value).trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE')
const fields = Object.freeze({
  actualArrivalLoadingAt: ['loading_arrival'], actualArrivalUnloadingAt: ['unloading_arrival'],
  estimatedArrivalLoadingAt: ['loading_eta'], estimatedArrivalUnloadingAt: ['unloading_eta'],
  actualDepartureLoadingAt: ['loading_departure'], estimatedDepartureLoadingAt: ['loading_departure'],
  loadingStartedAt: ['loading_update'], loadingCompletedAt: ['loading_update'],
  unloadingStartedAt: ['unloading_update'], unloadingCompletedAt: ['unloading_update'],
})
const footer = /^\s*(?:ladestelle|entladestelle|loading (?:site|place|point)|unloading (?:site|place|point)|termin|time slot|geplanter beginn|planned start)\s*(?:\/[^:]+)?\s*:/i
const header = /^(?:von|from|gesendet|sent|datum|date|an|to|cc|bcc|betreff|subject):/i
const marker = /^(?:on .{3,400} wrote:|am .{3,400} schrieb(?:en)? .{1,200}:|[-_ ]*(?:original message|ursprüngliche nachricht|weitergeleitete nachricht|forwarded message)[-_ :]*|begin forwarded message:|[_-]{5,})$/i

function nearestQuotedMessage(mail) {
  const provided = text(mail?.quotedContext)
  let raw
  if (provided.trim()) raw = splitMailConversation(provided).find(block => block.trim()) || ''
  else {
    const body = text(mail?.bodyText)
    const blocks = splitMailConversation(body)
    if (blocks.length > 1) raw = blocks[1]
    else {
      const match = /(?:^|\n)\s*>/.exec(body)
      if (!match) return ''
      raw = body.slice(match.index).trimStart()
    }
  }
  const lines = text(raw).split(/\r?\n/)
  const content = [], referenceLines = []
  let inHeaders = true, depth = null
  for (const original of lines) {
    const prefix = /^\s*(>+)\s?/.exec(original)
    const lineDepth = prefix ? prefix[1].length : 0
    const line = (prefix ? original.slice(prefix[0].length) : original).trim()
    if (inHeaders && (!line || header.test(line) || marker.test(line))) { referenceLines.push(line); continue }
    if (line && depth === null) depth = lineDepth
    if (lineDepth > (depth || 0)) break
    referenceLines.push(line)
    inHeaders = false
    if (/^(?:mit freundlichen gr(?:ü|ue)ßen|best regards|kind regards|regards[,!]?|sent from my|gesendet von meinem)\b/i.test(line)) break
    content.push(line)
  }
  return { body: content.join('\n').trim().slice(0, 6000), referenceText: referenceLines.join('\n').slice(0, 12000) }
}

function stationOf(value) {
  const line = normalized(value)
  const unloading = /entlad|unload|consignee|delivery (?:site|point)|rozład|décharg|scarico|descarg/i.test(line)
  const withoutUnloading = line.replace(/entlad[\p{L}]*|unload[\p{L}]*|rozład[\p{L}]*|décharg[\p{L}]*|scarico|descarg[\p{L}]*/giu, '')
  const loading = /ladestelle|belad|\bload(?:ing)?\b|pick[- ]?up|załad|carico|chargement/i.test(withoutUnloading)
  return loading === unloading ? null : unloading ? 'unloading' : 'loading'
}

/** Read the nearest question from the supplied conversation only. This value is
 * transient prompt context; callers must not persist questionText as a copy. */
export function getStatusMailReplyContext(mail) {
  const nearest = nearestQuotedMessage(mail)
  const quoted = nearest?.body
  if (!quoted) return null
  const references = new Set([...nearest.referenceText.matchAll(/\b(?:TA|Transportauftrag|transport order|order)(?:\s*(?:no\.?|nr\.?|number|nummer))?\s*[:#-]?\s*(\d{9})\b/gi)].map(match => match[1]))
  const currentNumber = text(mail?.transportOrderNumber)
  if (references.size > 1 || /^\d{9}$/.test(currentNumber) && references.size && !references.has(currentNumber)) return null
  const bodyLines = quoted.split('\n').filter(line => !footer.test(line))
  const questionText = bodyLines.join('\n').trim().slice(0, 3600)
  const topics = new Set()
  const overallStation = stationOf(quoted)
  for (const sentence of questionText.split(/(?<=[?!.])\s+|\n+/)) {
    if (!/[?？]|\b(?:bitte|könnt|können|wann|wie|ist|habt|please|could|would|when|how|has|have|is|update)\b/i.test(sentence)) continue
    const station = stationOf(sentence) || overallStation
    if (/nach plan|according to plan|on schedule|everything.{0,20}plan/i.test(sentence)) topics.add('plan_confirmation')
    if (/kennzeichen|licen[cs]e plate|registration number|plate number/i.test(sentence)) topics.add('plate')
    const distance = /kilomet(?:er|re)|\bkm\b/i.test(sentence) && /noch|left|remain|distance|wie viel|how many/i.test(sentence)
    if (distance && station === 'unloading') topics.add('unloading_distance')
    if (!station) continue
    const arrivedQuestion = /angekommen|arrived|(?:ist|sind).{0,60}(?:an der|bei der|vor ort|\bda\b)|is.{0,60}(?:at the|on site|\bthere\b)|already.{0,30}(?:at|there)/i.test(sentence)
    const eta = /voraussichtlich|expected|\beta\b|\bwann\b|\bwhen\b|around what time|ankunftszeit|arrival time/i.test(sentence) || /ankunft/i.test(sentence) && !arrivedQuestion
    if (!distance && eta) topics.add(`${station}_eta`)
    if (arrivedQuestion && !eta && !distance) topics.add(`${station}_arrival`)
    if (/abfahrt|abgefahren|depart(?:ure|ed)?|\bleft\b|\bleave\b/i.test(sentence) && station === 'loading') topics.add('loading_departure')
    if (/update|beladestatus|entladestatus|loading status|unloading status|(?:be|ent)ladung.{0,40}(?:abgeschlossen|fertig|läuft)|(?:un)?loading.{0,40}(?:completed|progress)/i.test(sentence) && !distance) topics.add(`${station}_update`)
  }
  if (!topics.size) return null
  const stops = new Set([...topics].filter(topic => /^(?:loading|unloading)_/.test(topic)).map(topic => topic.split('_')[0]))
  return { questionText, topics: [...topics], station: stops.size === 1 ? [...stops][0] : overallStation }
}

function newestReply(mail) {
  return splitMailConversation(text(mail?.bodyText))[0].split(/(?:^|\n)\s*>/)[0].split(/\n\s*(?:mit freundlichen gr(?:ü|ue)ßen|best regards|kind regards|regards[,!]?)/i)[0]
}
function literalReply(mail, evidence) {
  const value = normalized(evidence)
  return Boolean(value && value.length <= 240 && normalized(newestReply(mail)).includes(value))
}
function shortAffirmative(evidence) {
  return /^(?:ja|yes|yep|yeah|oui|si|sí|tak)(?:[,!.\s]+(?:(?:ist|sind) (?:er|es|sie)|(?:he|it|we|they) (?:is|are)|danke|thanks|thank you|alles (?:gut|okay|ok)|all good|no problems?|no issues|everything is fine))?[. !,]*$/i.test(text(evidence).trim())
}
function contradictsArrival(value) {
  const line = normalized(value)
  return /\b(?:nein|nope|never)\b|\b(?:noch\s+)?nicht\s+(?:(?:schon|bereits|wirklich|aktuell)\s+)?(?:dort|da|vor\s+ort|angekommen|eingetroffen|an\s+der\s+(?:lade|entlade)stelle)\b|\b(?:not|isn[’']t|aren[’']t)\s+(?:yet\s+)?(?:there|here|on\s+site|arrived|at\s+(?:the\s+)?(?:loading|unloading))\b|\b(?:hasn[’']t|haven[’']t|didn[’']t)\s+(?:yet\s+)?arriv/i.test(line)
}
function deniesOrPredictsArrival(value) {
  const line = normalized(value)
  return /^(?:nein|nope|noch nicht|not yet)\b|^no(?=[,.!]|\s+(?:not|at|around|the|he|it|we|they|\d))|\b(?:kommt|kommen|voraussichtlich|erwartet|eta|expected|will|arriving|arrive)\b|be there/i.test(line)
}
function explicitReplyClock(value) { return /\b\d{1,2}[:.]\d{2}\b|\b\d{1,2}\s*(?:uhr|am|pm)\b/i.test(value) }
function clearArrival(evidence) {
  const line = normalized(evidence)
  if (contradictsArrival(line) || /[?？]|\b(?:wann|when|wenn|falls|if|sobald)\b/i.test(line)) return false
  return /angekommen|eingetroffen|vor ort|\b(?:ist|sind) da\b|\barrived\b|\b(?:is|are) (?:already )?there\b|on site|na miejscu|przyjecha|dotar|déjà arrivé|sur place|arrivato|llegado/i.test(line)
}
function conciseCurrentAnswer(mail) {
  const lines = newestReply(mail).trim().split(/\r?\n/)
  const greeting = /^(?:hallo|hi|hello|guten tag|guten morgen|good morning|good afternoon)[,! .]*$/i
  const harmlessEnd = /^(?:danke|vielen dank|thanks|thank you|lg|vg)[,! .]*$/i
  const orderLine = /^TA\s*[:#-]?\s*\d{9}[.!]?$/i
  while (lines.length && (!lines[0].trim() || greeting.test(lines[0].trim()) || orderLine.test(lines[0].trim()))) lines.shift()
  while (lines.length && (!lines.at(-1).trim() || harmlessEnd.test(lines.at(-1).trim()) || orderLine.test(lines.at(-1).trim()))) lines.pop()
  return lines.join('\n').trim()
}

/** Source identity and target meaning are checked separately from the model's
 * guessed timeline. Only a current answer can select a prior request topic. */
export function statusReplyFieldBasis(field, mail, evidence) {
  if (!literalReply(mail, evidence)) return null
  const context = getStatusMailReplyContext(mail)
  if (!context || !fields[field]) return null
  const target = field.includes('Unloading') || field.startsWith('unloading') ? 'unloading' : 'loading'
  const explicitReplyStation = stationOf(evidence)
  if (explicitReplyStation && explicitReplyStation !== target) return null
  const completeAnswer = conciseCurrentAnswer(mail)
  if (field.startsWith('actualArrival') && (contradictsArrival(completeAnswer) || deniesOrPredictsArrival(evidence))) return null
  const departed = /abgefah|abfahrt|depart(?:ed|ure)?|\bleft\b|\bleave\b/i.test(evidence)
  const completed = /fertig|abgeschlossen|beladen|loaded|loading.{0,15}complete|\b(?:done|finished)\b/i.test(evidence)
  const started = /gestartet|begonnen|beginnt|läuft|\bstart(?:ed|ing)?\b|\b(?:began|begun)\b|in progress|being (?:un)?loaded/i.test(evidence)
  if (field.includes('Departure') && completed && !departed) return null
  if (field.endsWith('CompletedAt') && !completed) return null
  if (field.endsWith('StartedAt') && !started) return null
  if (field.startsWith('actualArrival') && completed && !clearArrival(evidence)) return null
  const affirmative = shortAffirmative(evidence)
  if (affirmative && (context.topics.length !== 1 || context.topics[0] !== `${target}_arrival` || !field.startsWith('actualArrival'))) return null
  const matches = fields[field].filter(topic => context.topics.includes(topic))
  if (field.startsWith('estimatedArrival') && explicitReplyClock(evidence) && deniesOrPredictsArrival(evidence) && context.topics.includes(`${target}_arrival`)) matches.push(`${target}_arrival`)
  if (field.startsWith('actualArrival') && clearArrival(evidence)) {
    for (const topic of [`${target}_eta`, `${target}_update`]) if (context.topics.includes(topic)) matches.push(topic)
  }
  const relevantStops = new Set(context.topics.filter(topic => /^(?:loading|unloading)_/.test(topic)).map(topic => topic.split('_')[0]))
  if (!matches.length || relevantStops.size > 1 && !explicitReplyStation) return null
  return { topic: matches[0], station: target, questionKind: matches[0] }
}

export function replyAffirmsArrival(mail, evidence, field) {
  if (!field?.startsWith('actualArrival') || !statusReplyFieldBasis(field, mail, evidence)) return false
  const completeAnswer = conciseCurrentAnswer(mail)
  if (contradictsArrival(completeAnswer)) return false
  if (shortAffirmative(evidence)) return shortAffirmative(completeAnswer) || clearArrival(completeAnswer)
  return clearArrival(evidence) && clearArrival(completeAnswer)
}

/** Deterministic fallback for a concise current answer missed by the model.
 * No stated clock/duration may be replaced with the message receipt time. */
export function statusReplyArrivalCandidate(mail) {
  const evidence = conciseCurrentAnswer(mail)
  if (!evidence || evidence.length > 240 || /\d/.test(evidence)) return null
  const candidates = ['actualArrivalLoadingAt', 'actualArrivalUnloadingAt'].filter(field => replyAffirmsArrival(mail, evidence, field))
  if (candidates.length !== 1) return null
  return { field: candidates[0], value: '', evidence, confidence: 'medium', timeBasis: 'mail_already_arrived', stationBasis: 'reply_context', contextFields: [] }
}

export function replyDistanceBasis(mail, evidence) {
  if (!literalReply(mail, evidence) || !/^\s*(?:(?:noch|about|ca\.?|circa|approximately)\s+)?\d{1,5}(?:[.,]\d+)?[. !]*\s*$/i.test(text(evidence))) return null
  const context = getStatusMailReplyContext(mail)
  if (!context || context.topics.length !== 1 || context.topics[0] !== 'unloading_distance') return null
  return { topic: 'unloading_distance', station: 'unloading', unit: 'km' }
}
