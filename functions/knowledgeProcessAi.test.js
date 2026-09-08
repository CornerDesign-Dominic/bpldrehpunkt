import assert from 'node:assert/strict'
import test from 'node:test'
import { cleanGeneratedProcess } from './knowledgeProcessAi.js'

test('a delay at the unloading location creates a structurally valid compact process draft', () => {
  const process = cleanGeneratedProcess({
    title: 'Verspätung an der Entladestelle bearbeiten',
    category: 'transport_dispatch',
    shortDescription: 'Vorgehen bei einer gemeldeten Verspätung an der Entladestelle.',
    startTarget: 'verspaetung_aufnehmen',
    nodes: [
      { key: 'verspaetung_aufnehmen', type: 'action', title: 'Verspätung aufnehmen', description: 'Meldung, Ursache und voraussichtliche Ankunftszeit dokumentieren.', checklistItems: [], outputs: [] },
      { key: 'empfaenger_informieren', type: 'decision', title: 'Muss der Empfänger informiert werden?', description: 'Prüfen, ob die vereinbarte Ankunftszeit nicht mehr eingehalten werden kann.', checklistItems: [], outputs: [{ key: 'ja', label: 'Ja' }, { key: 'nein', label: 'Nein' }] },
      { key: 'empfaenger_benachrichtigen', type: 'action', title: 'Empfänger benachrichtigen', description: 'Die neue voraussichtliche Ankunftszeit klar mitteilen.', checklistItems: [], outputs: [] },
      { key: 'vorgang_abschliessen', type: 'end', title: 'Vorgang abschließen', description: 'Die Bearbeitung der Verspätungsmeldung ist beendet.', checklistItems: [], outputs: [] },
    ],
    edges: [
      { sourceKey: 'verspaetung_aufnehmen', targetKey: 'empfaenger_informieren', sourceOutputKey: '' },
      { sourceKey: 'empfaenger_informieren', targetKey: 'empfaenger_benachrichtigen', sourceOutputKey: 'ja' },
      { sourceKey: 'empfaenger_informieren', targetKey: 'vorgang_abschliessen', sourceOutputKey: 'nein' },
      { sourceKey: 'empfaenger_benachrichtigen', targetKey: 'vorgang_abschliessen', sourceOutputKey: '' },
    ],
  })

  assert.equal(process.status, 'draft')
  assert.equal(process.nodes.length, 5)
  assert.equal(process.edges.length, 5)
  assert.equal(process.nodes.find((node) => node.type === 'decision')?.outputs.length, 2)
  assert.equal(process.nodes.filter((node) => node.type === 'end').length, 1)
})

test('the structural validator rejects omitted required arrays', () => {
  assert.throws(() => cleanGeneratedProcess({
    title: 'Unvollständiger Entwurf',
    category: 'transport_dispatch',
    shortDescription: 'Dieser Entwurf lässt ein Pflichtfeld absichtlich aus.',
    startTarget: 'schritt',
    nodes: [
      { key: 'schritt', type: 'action', title: 'Schritt', description: '', outputs: [] },
      { key: 'ende', type: 'end', title: 'Ende', description: '', checklistItems: [], outputs: [] },
    ],
    edges: [{ sourceKey: 'schritt', targetKey: 'ende', sourceOutputKey: '' }],
  }), (error) => error?.errorType === 'invalid_model_response' && error?.validationReason === 'node_required_arrays')
})
