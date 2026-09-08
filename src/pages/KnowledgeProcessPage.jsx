import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import Toast from '../components/ui/Toast.jsx'
import ProcessFlow from '../components/knowledge-processes/ProcessFlow.jsx'
import { usePermissions } from '../auth/usePermissions.js'
import { KNOWLEDGE_PROCESS_CATEGORIES, KNOWLEDGE_PROCESS_NODE_TYPES, categoryLabel, createEmptyKnowledgeProcess, createKnowledgeProcessNode, formatProcessDate, getKnowledgeProcess, outgoingEdges, processValidationErrors, saveKnowledgeProcess, statusLabel } from '../lib/knowledgeProcesses.js'
import '../styles/knowledgeProcesses.css'

function NodeEditor({ node, onCancel, onSave }) {
  const [value, setValue] = useState(() => structuredClone(node))
  const update = (field, next) => setValue((current) => ({ ...current, [field]: next }))
  const save = (event) => { event.preventDefault(); onSave(value) }
  return <div className="process-modal-backdrop"><form className="process-modal" onSubmit={save}><div className="process-modal__heading"><h2>{node.type === 'start' ? 'Startblock bearbeiten' : 'Block bearbeiten'}</h2><button className="button button--secondary" type="button" onClick={onCancel}>Schließen</button></div><label className="form-field"><span>Titel *</span><input required value={value.title || ''} onChange={(event) => update('title', event.target.value)} /></label><label className="form-field"><span>Kurze Anweisung / Erklärung</span><textarea value={value.description || ''} onChange={(event) => update('description', event.target.value)} rows="4" /></label>{value.type === 'decision' && <div className="process-node-form-section"><span>Entscheidungswege</span>{value.outputs.map((output, index) => <label className="form-field" key={output.id}><span>{index + 1}. Ausgang</span><input required value={output.label} onChange={(event) => update('outputs', value.outputs.map((item) => item.id === output.id ? { ...item, label: event.target.value } : item))} /></label>)}</div>}{value.type === 'checklist' && <div className="process-node-form-section"><span>Checklistenpunkte</span>{value.checklistItems.map((item, index) => <div className="process-checklist-input" key={index}><input value={item} placeholder="Checklistenpunkt" onChange={(event) => update('checklistItems', value.checklistItems.map((entry, itemIndex) => itemIndex === index ? event.target.value : entry))} /><button type="button" onClick={() => update('checklistItems', value.checklistItems.filter((_, itemIndex) => itemIndex !== index))} disabled={value.checklistItems.length === 1}>Entfernen</button></div>)}<button className="button button--secondary" type="button" onClick={() => update('checklistItems', [...value.checklistItems, ''])}>Punkt hinzufügen</button></div>}<div className="process-modal__actions"><button className="button" type="submit">Block übernehmen</button></div></form></div>
}

export default function KnowledgeProcessPage({ isNew = false }) {
  const { processId } = useParams()
  const navigate = useNavigate()
  const { canEdit } = usePermissions()
  const editable = canEdit('knowledgeProcesses')
  const [process, setProcess] = useState(isNew ? createEmptyKnowledgeProcess() : null)
  const [loading, setLoading] = useState(!isNew)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(isNew)
  const [nodeEditing, setNodeEditing] = useState(null)
  const [adding, setAdding] = useState(null)
  const [confirmation, setConfirmation] = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => {
    if (isNew) return undefined
    let current = true
    getKnowledgeProcess(processId).then((item) => { if (!item) throw new Error('not-found'); if (current) setProcess(item) }).catch(() => { if (current) setError('Der Prozess konnte nicht geladen werden oder ist nicht verfügbar.') }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [isNew, processId])

  const validationErrors = useMemo(() => process ? processValidationErrors(process) : [], [process])
  const updateProcess = (field, value) => setProcess((current) => ({ ...current, [field]: value }))
  const updateNode = (node) => setProcess((current) => ({ ...current, nodes: current.nodes.map((entry) => entry.id === node.id ? node : entry) }))

  function addNode(type) {
    const node = createKnowledgeProcessNode(type)
    setProcess((current) => ({ ...current, nodes: [...current.nodes, node], edges: [...current.edges, { id: `edge_${adding.node.id}_${adding.outputId || 'next'}_${node.id}`, sourceId: adding.node.id, targetId: node.id, sourceOutputId: adding.outputId || '' }] }))
    setAdding(null)
  }

  function descendants(nodeId) {
    const ids = new Set([nodeId]); const queue = [nodeId]
    while (queue.length) for (const edge of outgoingEdges(process, queue.shift())) if (!ids.has(edge.targetId)) { ids.add(edge.targetId); queue.push(edge.targetId) }
    return ids
  }

  function deleteNode(node) {
    const ids = descendants(node.id)
    setProcess((current) => ({ ...current, nodes: current.nodes.filter((entry) => !ids.has(entry.id)), edges: current.edges.filter((edge) => !ids.has(edge.sourceId) && !ids.has(edge.targetId)) }))
    setConfirmation(null)
  }

  async function save(status) {
    if (status === 'active' && validationErrors.length) { setError('Der Prozess kann noch nicht freigegeben werden. Bitte die Hinweise im Editor beachten.'); return }
    setSaving(true); setError('')
    try {
      const result = await saveKnowledgeProcess(isNew ? '' : process.id, process, status)
      setToast(status === 'active' ? 'Prozess freigegeben.' : status === 'archived' ? 'Prozess archiviert.' : 'Entwurf gespeichert.')
      if (isNew) navigate(`/wissen-prozesse/${result.id}`, { replace: true })
      else { setProcess((current) => ({ ...current, status: result.status })); setEditing(false) }
    } catch (saveError) { setError(saveError.message || 'Der Prozess konnte nicht gespeichert werden.') } finally { setSaving(false) }
  }

  if (loading) return <p className="knowledge-processes-state">Prozess wird geladen …</p>
  if (!process) return <p className="form-error">{error || 'Der Prozess ist nicht verfügbar.'}</p>
  const canModify = editable && process.status !== 'archived'
  const editMode = editing && canModify
  return <div className="knowledge-process-page">
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    <ConfirmDialog open={Boolean(confirmation)} title={confirmation?.title || ''} message={confirmation?.message || ''} confirmLabel={confirmation?.confirmLabel || 'Bestätigen'} variant={confirmation?.variant} isSubmitting={saving} onCancel={() => setConfirmation(null)} onConfirm={() => confirmation?.action()} />
    {nodeEditing && <NodeEditor node={nodeEditing} onCancel={() => setNodeEditing(null)} onSave={(node) => { updateNode(node); setNodeEditing(null) }} />}
    {adding && <div className="process-modal-backdrop"><section className="process-modal process-type-picker"><div className="process-modal__heading"><h2>Nächsten Schritt hinzufügen</h2><button className="button button--secondary" type="button" onClick={() => setAdding(null)}>Schließen</button></div><p>Wähle den Typ für den nächsten Prozessblock.</p><div>{KNOWLEDGE_PROCESS_NODE_TYPES.map((type) => <button type="button" key={type.value} onClick={() => addNode(type.value)}><strong>{type.label}</strong></button>)}</div></section></div>}
    <div className="knowledge-process-page__toolbar"><Link className="button button--secondary" to="/wissen-prozesse">Zur Übersicht</Link>{!editMode && canModify && <button className="button" type="button" onClick={() => setEditing(true)}>Prozess bearbeiten</button>}{editMode && <><button className="button button--secondary" type="button" onClick={() => { setEditing(false); if (isNew) navigate('/wissen-prozesse') }}>Abbrechen</button><button className="button button--secondary" type="button" disabled={saving} onClick={() => save('draft')}>Als Entwurf speichern</button><button className="button" type="button" disabled={saving || validationErrors.length > 0} onClick={() => save('active')}>Freigeben</button></>}{editable && process.status === 'active' && !editMode && <button className="button button--secondary" type="button" onClick={() => setConfirmation({ title: 'Prozess archivieren?', message: 'Der Prozess ist anschließend nur noch für Nutzer mit Bearbeitungsrecht sichtbar.', confirmLabel: 'Archivieren', action: () => save('archived') })}>Archivieren</button>}</div>
    <section className="knowledge-process-head"><div><span className={`process-status process-status--${process.status}`}>{statusLabel(process.status)}</span><h2>{editMode ? <input value={process.title} placeholder="Prozesstitel" onChange={(event) => updateProcess('title', event.target.value)} /> : process.title || 'Unbenannter Prozess'}</h2>{editMode ? <><label className="form-field"><span>Kategorie</span><select value={process.category} onChange={(event) => updateProcess('category', event.target.value)}><option value="">Kategorie auswählen</option>{KNOWLEDGE_PROCESS_CATEGORIES.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label><label className="form-field"><span>Kurzbeschreibung</span><textarea rows="2" value={process.shortDescription} onChange={(event) => updateProcess('shortDescription', event.target.value)} /></label></> : <><p>{process.shortDescription || 'Keine Kurzbeschreibung hinterlegt.'}</p><dl><div><dt>Kategorie</dt><dd>{categoryLabel(process.category)}</dd></div><div><dt>Letzte Änderung</dt><dd>{formatProcessDate(process.updatedAt)} · {process.updatedByName || '—'}</dd></div></dl></>}</div></section>
    {editMode && validationErrors.length > 0 && <section className="process-validation"><strong>Für die Freigabe noch offen</strong><ul>{validationErrors.map((item) => <li key={item}>{item}</li>)}</ul></section>}
    <ProcessFlow process={process} editable={editMode} onAdd={(node, outputId) => setAdding({ node, outputId })} onEdit={setNodeEditing} onDelete={(node) => { const count = descendants(node.id).size; setConfirmation({ title: 'Block löschen?', message: `Dieser Block und ${count - 1 > 0 ? `${count - 1} nachfolgende Block/Blöcke` : 'sein nachfolgender Weg'} werden entfernt.`, confirmLabel: 'Löschen', variant: 'danger', action: () => deleteNode(node) }) }} />
  </div>
}
