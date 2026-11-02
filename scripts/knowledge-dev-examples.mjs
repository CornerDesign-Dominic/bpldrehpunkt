import { createRequire } from 'node:module'
import { normalizeKnowledgeInput } from '../functions/knowledge.js'

const requireFunctions = createRequire(new URL('../functions/package.json', import.meta.url))
const { FieldValue } = requireFunctions('firebase-admin/firestore')
const ruleId = 'dev-example-customer-status-communication'
const common = { status: 'valid', owner: 'Dev-Testbeispiele', lastReviewedDate: '', nextReviewDate: '' }
const article = (id, values) => ({ kind: 'article', id, expectedRevision: 0, values: { ...common, process: 'Transportdurchführung', topic: 'Kunde fragt nach Lieferstatus', tags: 'Dev-Beispiel, Lieferstatus, Sendungsstatus, Statusanfrage, Wo bleibt die Ware', ruleIds: [ruleId], ...values } })

export const knowledgeDevExamples = [
  { kind: 'rule', id: ruleId, expectedRevision: 0, values: { ...common,
    title: 'Dev-Beispiel: Kommunikation mit Kunden zum Lieferstatus', audience: 'customer',
    scope: 'Testregel für Antworten auf Kundenanfragen zum Lieferstatus. Als Beispiel auf Dev angelegt; vor einer fachlichen Übernahme prüfen.',
    provisions: 'Freundlich, sachlich und verständlich antworten. Nur belegte Angaben nennen. Bestätigte Zeitpunkte von bloßen Prognosen unterscheiden. Fehlende Informationen durch eine gezielte Rückfrage klären. Die KI erstellt nur einen Entwurf; ein Mensch prüft ihn und entscheidet über den Versand.',
    avoid: 'Keine Liefertermine, Zusagen oder angeblich bereits durchgeführten Prüfungen erfinden. Keine internen Handbuchtexte, personenbezogenen Angaben Dritter oder Schuldzuweisungen in die Antwort übernehmen. Keine automatische Antwort versenden.',
    exceptions: 'Bei widersprüchlichen Angaben, erkennbarer Verspätung, Schaden oder Beschwerde nicht die einfache Statusantwort verwenden. Den Sachverhalt vor dem Versand mit einer zuständigen Person klären. Keine nicht vereinbarte feste Rückmeldefrist zusagen.',
    examples: 'Passend: „Bitte nennen Sie uns Ihre Auftrags- oder Sendungsnummer, damit wir den Transport zuordnen können.“\nNicht passend ohne Beleg: „Die Ware kommt heute garantiert um 14 Uhr.“',
  } },
  article('dev-example-delivery-status-confirmed', {
    title: 'Dev-Beispiel: Kunde fragt nach Lieferstatus – bestätigter Stand liegt vor',
    situation: 'Ein Kunde fragt nach dem Lieferstatus. Der Transport ist eindeutig zugeordnet und ein aktueller bestätigter Status liegt als prüfbare Information vor. Nicht anwenden bei fehlender Auftragszuordnung, veraltetem oder widersprüchlichem Status, Schaden, Beschwerde oder ungeklärter Verspätung.',
    checks: 'Auftrag oder Sendung eindeutig zuordnen. Quelle und Zeitpunkt der Statusinformation prüfen. Feststellen, ob eine genannte Ankunftszeit bestätigt oder nur prognostiziert ist. Empfänger und Freigabe der Angaben prüfen.',
    action: 'Den belegten aktuellen Stand knapp mitteilen. Eine bestätigte Uhrzeit nur nennen, wenn sie tatsächlich vorliegt; Prognosen ausdrücklich als Prognose kennzeichnen. Fehlende Angaben nicht ergänzen. Den Entwurf vor dem manuellen Versand mit der tatsächlichen Statusquelle abgleichen.',
    cautions: 'Dieses Beispiel enthält keine echten Transportdaten. Aus der bloßen Kundenanfrage lässt sich der Status nicht ableiten. Keine Abfahrt, Zustellung oder Ankunftszeit behaupten, wenn sie nicht belegt ist.',
    responseTemplate: 'In eigenen Worten kurz antworten: Bezug auf die Anfrage nehmen und ausschließlich den tatsächlich bestätigten Stand wiedergeben. Dieses Beispiel stellt keinen festen Status oder Liefertermin bereit.',
    followUp: 'Die tatsächlich versandte Auskunft am Vorgang nachvollziehbar halten. Bei einer späteren Abweichung den neuen Sachverhalt prüfen.',
  }),
  article('dev-example-delivery-status-unconfirmed', {
    title: 'Dev-Beispiel: Kunde fragt nach Lieferstatus – aktuelle Bestätigung fehlt',
    situation: 'Ein Kunde fragt nach dem Lieferstatus. Der Auftrag ist eindeutig zugeordnet, aber es liegt kein ausreichend aktueller oder bestätigter Status vor. Nicht anwenden, wenn bereits bestätigte Informationen verfügbar sind oder die Auftragsreferenz fehlt.',
    checks: 'Auftragszuordnung prüfen. Bereits vorhandene Informationen und deren Aktualität prüfen. Klären, wer den aktuellen Stand verlässlich bestätigen kann.',
    action: 'Keine ungeprüfte Statusangabe oder Ankunftszeit mitteilen. Den aktuellen Stand bei der zuständigen Stelle klären. Bis zur Bestätigung einen neutralen Entwurf erstellen, der keine bereits erfolgte Prüfung behauptet. Ein Mensch prüft Inhalt und Zusagen vor dem Versand.',
    cautions: 'Keine feste Rückmeldefrist ohne betriebliche Grundlage versprechen. Eine fehlende aktuelle Transportinformation ist nicht automatisch eine Wissenslücke: Dieser Artikel beschreibt gerade das Vorgehen bei fehlendem Status.',
    responseTemplate: 'Vielen Dank für Ihre Anfrage. Uns liegt derzeit noch keine bestätigte aktuelle Statusmeldung vor. Für eine verlässliche Auskunft muss der aktuelle Stand zunächst geklärt werden.',
    followUp: 'Eine aktuelle Bestätigung einholen und danach den Kunden über den belegten Stand informieren. Offene Rückmeldung am Vorgang weiterverfolgen.',
  }),
  article('dev-example-delivery-status-reference-missing', {
    title: 'Dev-Beispiel: Kunde fragt nach Lieferstatus – Sendung nicht zuordenbar',
    situation: 'Ein Kunde fragt nach dem Lieferstatus, aber aus der Nachricht und den verfügbaren Informationen lässt sich kein Transport eindeutig zuordnen. Auftrags- oder Sendungsreferenz fehlt oder ist mehrdeutig. Nicht anwenden, wenn die Zuordnung bereits eindeutig möglich ist.',
    checks: 'Nach einer vorhandenen Referenz in Nachricht und zugeordnetem Vorgang suchen. Prüfen, ob eine vorhandene Nummer eindeutig ist. Keine Zuordnung zu einem fremden Transport raten.',
    action: 'Den Kunden gezielt nach einer Auftrags- oder Sendungsnummer fragen. Nur wenn nötig ergänzende Angaben zur eindeutigen Zuordnung erfragen. Bis dahin keine Aussage über den Transportstatus treffen.',
    cautions: 'Keine Daten anderer Aufträge oder Personen offenlegen. Fehlende konkrete Referenzen durch Rückfrage klären, nicht durch erfundene Angaben ersetzen.',
    responseTemplate: 'Vielen Dank für Ihre Anfrage. Bitte teilen Sie uns Ihre Auftrags- oder Sendungsnummer mit, damit wir den Transport eindeutig zuordnen und den Lieferstatus prüfen können.',
    followUp: 'Nach Eingang der Referenz zuordnen und je nach vorhandener Statusinformation den passenden Statusartikel verwenden.',
  }),
].map(normalizeKnowledgeInput)

export async function seedKnowledgeDevExamples(db) {
  if (db.projectId !== 'db-bpl-drehpunkt-dev') throw new Error('Beispiele dürfen ausschließlich in db-bpl-drehpunkt-dev angelegt werden.')
  return db.runTransaction(async (tx) => {
    const refs = knowledgeDevExamples.map((item) => db.doc(`${item.kind === 'rule' ? 'knowledgeRules' : 'knowledgeArticles'}/${item.id}`))
    const existing = await Promise.all(refs.map((ref) => tx.get(ref)))
    if (existing.some((snapshot) => snapshot.exists && snapshot.data().createdBy !== 'dev-example-seed')) throw new Error('Eine Beispiel-ID wird bereits anderweitig verwendet; es wird nichts überschrieben.')
    if (existing[0].exists && existing[0].data().status !== 'valid' && existing.slice(1).some((snapshot) => !snapshot.exists)) throw new Error('Die vorhandene Beispielregel ist nicht gültig; fehlende Artikel werden nicht veröffentlicht.')
    const result = []
    for (const [index, item] of knowledgeDevExamples.entries()) {
      if (existing[index].exists) { result.push({ id: item.id, status: 'exists' }); continue }
      const now = FieldValue.serverTimestamp()
      const record = { ...item.values, revision: 1, createdAt: now, updatedAt: now, createdBy: 'dev-example-seed', updatedBy: 'dev-example-seed', updatedByName: 'Dev-Testbeispiele' }
      tx.create(refs[index], record)
      tx.create(refs[index].collection('revisions').doc('1'), record)
      result.push({ id: item.id, status: 'created' })
    }
    return result
  })
}
