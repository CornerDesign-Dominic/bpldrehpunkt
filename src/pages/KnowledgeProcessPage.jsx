import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import Toast from '../components/ui/Toast.jsx'
import ProcessFlow from '../components/knowledge-processes/ProcessFlow.jsx'
import { usePermissions } from '../auth/usePermissions.js'
import { listDepartments } from '../lib/departments.js'
import { listFunctionalRoles } from '../lib/functionalRoles.js'
import { KNOWLEDGE_PROCESS_CATEGORIES, KNOWLEDGE_PROCESS_NODE_TYPES, categoryLabel, createEmptyKnowledgeProcess, createKnowledgeProcessNode, formatProcessDate, getKnowledgeProcess, outgoingEdges, processValidationErrors, saveKnowledgeProcess, statusLabel } from '../lib/knowledgeProcesses.js'
import '../styles/knowledgeProcesses.css'

const answerOutputId = () => `answer_${globalThis.crypto?.randomUUID?.().replaceAll('-', '_') || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`

function NodeEditor({ departments, functionalRoles, node, onCancel, onRemoveOutput, onSave, process }) {
  const [value, setValue] = useState(() => structuredClone(node))
  const [outputToDelete, setOutputToDelete] = useState(null)
  const update = (field, next) => setValue((current) => ({ ...current, [field]: next }))
  const outputEdge = (outputId) => (process.edges || []).find((edge) => edge.sourceId === value.id && edge.sourceOutputId === outputId)
  const removeOutput = (output) => {
    onRemoveOutput(value.id, output.id)
    update('outputs', value.outputs.filter((item) => item.id !== output.id))
    setOutputToDelete(null)
  }
  const save = (event) => {
    event.preventDefault()
    const department = departments.find((item) => item.id === value.departmentId)
    const functionalRole = functionalRoles.find((item) => item.id === value.functionalRoleId)
    onSave({ ...value, departmentName: department?.name || '', functionalRoleName: functionalRole?.name || '' })
  }
  const isResponsible = ['action', 'checklist'].includes(value.type)
  return <div className="process-modal-backdrop">
    <ConfirmDialog open={Boolean(outputToDelete)} title="Antwortweg entfernen?" message="Der Antwortweg und alle dadurch nicht mehr erreichbaren Folgeschritte werden entfernt." confirmLabel="Antwortweg entfernen" variant="danger" onCancel={() => setOutputToDelete(null)} onConfirm={() => removeOutput(outputToDelete)} />
    <form className="process-modal" onSubmit={save}>
      <div className="process-modal__heading"><h2>{node.type === 'start' ? 'Startblock bearbeiten' : 'Block bearbeiten'}</h2><button className="process-modal__close" type="button" onClick={onCancel} aria-label="Modal schließen" title="Schließen">×</button></div>
      <label className="form-field"><span>Titel *</span><input required value={value.title || ''} onChange={(event) => update('title', event.target.value)} /></label>
      <label className="form-field"><span>Kurze Anweisung / Erklärung</span><textarea value={value.description || ''} onChange={(event) => update('description', event.target.value)} rows="4" /></label>
      {isResponsible && <div className="process-node-form-section"><span>Verantwortlichkeit</span><label className="form-field"><span>Verantwortliche Abteilung</span><select value={value.departmentId || ''} onChange={(event) => update('departmentId', event.target.value)}><option value="">Keine Abteilung</option>{departments.filter((department) => department.active || department.id === value.departmentId).map((department) => <option key={department.id} value={department.id} disabled={!department.active}>{department.name}{department.active ? '' : ' (inaktiv)'}</option>)}</select></label><label className="form-field"><span>Fachrolle</span><select value={value.functionalRoleId || ''} onChange={(event) => update('functionalRoleId', event.target.value)}><option value="">Keine Fachrolle</option>{functionalRoles.filter((functionalRole) => functionalRole.active || functionalRole.id === value.functionalRoleId).map((functionalRole) => <option key={functionalRole.id} value={functionalRole.id} disabled={!functionalRole.active}>{functionalRole.name}{functionalRole.active ? '' : ' (inaktiv)'}</option>)}</select></label></div>}
      {value.type === 'decision' && <div className="process-node-form-section"><span>Antwortwege der Frage</span>{value.outputs.map((output, index) => <div className="process-answer-output" key={output.id}><label className="form-field"><span>{index + 1}. Antwortweg</span><input required value={output.label} onChange={(event) => update('outputs', value.outputs.map((item) => item.id === output.id ? { ...item, label: event.target.value } : item))} /></label><button type="button" onClick={() => outputEdge(output.id) ? setOutputToDelete(output) : removeOutput(output)}>Entfernen</button></div>)}<button className="button button--secondary" type="button" onClick={() => update('outputs', [...value.outputs, { id: answerOutputId(), label: `Antwort ${value.outputs.length + 1}` }])}>Antwortweg hinzufügen</button></div>}
      {value.type === 'checklist' && <div className="process-node-form-section"><span>Checklistenpunkte</span>{value.checklistItems.map((item, index) => <div className="process-checklist-input" key={index}><input value={item} placeholder="Checklistenpunkt" onChange={(event) => update('checklistItems', value.checklistItems.map((entry, itemIndex) => itemIndex === index ? event.target.value : entry))} /><button type="button" onClick={() => update('checklistItems', value.checklistItems.filter((_, itemIndex) => itemIndex !== index))} disabled={value.checklistItems.length === 1}>Entfernen</button></div>)}<button className="button button--secondary" type="button" onClick={() => update('checklistItems', [...value.checklistItems, ''])}>Punkt hinzufügen</button></div>}
      <div className="process-modal__actions"><button className="button" type="submit">Block übernehmen</button></div>
    </form>
  </div>
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
  const [inserting, setInserting] = useState(null)
  const [connecting, setConnecting] = useState(null)
  const [confirmation, setConfirmation] = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [departments, setDepartments] = useState([])
  const [functionalRoles, setFunctionalRoles] = useState([])

  useEffect(() => {
    if (isNew) return undefined
    let current = true
    getKnowledgeProcess(processId).then((item) => { if (!item) throw new Error('not-found'); if (current) setProcess(item) }).catch(() => { if (current) setError('Der Prozess konnte nicht geladen werden oder ist nicht verfügbar.') }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [isNew, processId])

  useEffect(() => {
    if (!editable) return undefined
    let current = true
    Promise.all([listDepartments(), listFunctionalRoles()]).then(([availableDepartments, availableFunctionalRoles]) => { if (current) { setDepartments(availableDepartments); setFunctionalRoles(availableFunctionalRoles) } }).catch(() => { if (current) setError('Verantwortlichkeiten konnten nicht geladen werden.') })
    return () => { current = false }
  }, [editable])

  const validationErrors = useMemo(() => process ? processValidationErrors(process) : [], [process])
  const updateProcess = (field, value) => setProcess((current) => ({ ...current, [field]: value }))
  const updateNode = (node) => setProcess((current) => ({ ...current, nodes: current.nodes.map((entry) => entry.id === node.id ? node : entry) }))

  function removeAnswerOutput(nodeId, outputId) {
    setProcess((current) => {
      const edges = current.edges.filter((edge) => !(edge.sourceId === nodeId && edge.sourceOutputId === outputId))
      const start = current.nodes.find((node) => node.type === 'start')
      const reachable = new Set(start ? [start.id] : [])
      const queue = start ? [start.id] : []
      while (queue.length) {
        const currentId = queue.shift()
        for (const edge of edges.filter((item) => item.sourceId === currentId)) {
          if (!reachable.has(edge.targetId)) {
            reachable.add(edge.targetId)
            queue.push(edge.targetId)
          }
        }
      }
      return {
        ...current,
        nodes: current.nodes.filter((node) => reachable.has(node.id)).map((node) => node.id === nodeId ? { ...node, outputs: node.outputs.filter((output) => output.id !== outputId) } : node),
        edges: edges.filter((edge) => reachable.has(edge.sourceId) && reachable.has(edge.targetId)),
      }
    })
  }

  function addNode(type) {
    const node = createKnowledgeProcessNode(type)
    if (inserting) {
      setProcess((current) => ({ ...current, nodes: [...current.nodes, node], edges: current.edges.flatMap((edge) => edge.id === inserting.id ? [{ ...edge, targetId: node.id }, { id: `edge_${node.id}_${type === 'decision' ? 'yes' : 'next'}_${inserting.targetId}`, sourceId: node.id, targetId: inserting.targetId, sourceOutputId: type === 'decision' ? 'yes' : '' }] : [edge]) }))
      setInserting(null)
      return
    }
    setProcess((current) => ({ ...current, nodes: [...current.nodes, node], edges: [...current.edges, { id: `edge_${adding.node.id}_${adding.outputId || 'next'}_${node.id}`, sourceId: adding.node.id, targetId: node.id, sourceOutputId: adding.outputId || '' }] }))
    setAdding(null)
  }

  function canReachNode(fromId, targetId) {
    const visited = new Set()
    const queue = [fromId]
    while (queue.length) {
      const currentId = queue.shift()
      if (currentId === targetId) return true
      if (visited.has(currentId)) continue
      visited.add(currentId)
      for (const edge of outgoingEdges(process, currentId)) queue.push(edge.targetId)
    }
    return false
  }

  function connectToNode(targetId) {
    setProcess((current) => ({
      ...current,
      edges: [
        ...current.edges.filter((edge) => !(edge.sourceId === connecting.node.id && edge.sourceOutputId === connecting.outputId)),
        { id: `edge_${connecting.node.id}_${connecting.outputId}_${targetId}`, sourceId: connecting.node.id, targetId, sourceOutputId: connecting.outputId },
      ],
    }))
    setConnecting(null)
  }

  function disconnectAnswerOutput(node, outputId) {
    setProcess((current) => ({
      ...current,
      edges: current.edges.filter((edge) => !(edge.sourceId === node.id && edge.sourceOutputId === outputId)),
    }))
  }

  function deleteNode(node) {
    setProcess((current) => {
      const edges = current.edges.filter((edge) => edge.sourceId !== node.id && edge.targetId !== node.id)
      const start = current.nodes.find((entry) => entry.type === 'start')
      const reachable = new Set(start ? [start.id] : [])
      const queue = start ? [start.id] : []
      while (queue.length) {
        const currentId = queue.shift()
        for (const edge of edges.filter((item) => item.sourceId === currentId)) {
          if (!reachable.has(edge.targetId)) {
            reachable.add(edge.targetId)
            queue.push(edge.targetId)
          }
        }
      }
      return { ...current, nodes: current.nodes.filter((entry) => reachable.has(entry.id)), edges: edges.filter((edge) => reachable.has(edge.sourceId) && reachable.has(edge.targetId)) }
    })
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
  const connectableNodes = connecting ? process.nodes.filter((node) => node.type !== 'start' && node.id !== connecting.node.id && !canReachNode(node.id, connecting.node.id)) : []
  return <div className="knowledge-process-page">
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    <ConfirmDialog open={Boolean(confirmation)} title={confirmation?.title || ''} message={confirmation?.message || ''} confirmLabel={confirmation?.confirmLabel || 'Bestätigen'} variant={confirmation?.variant} isSubmitting={saving} onCancel={() => setConfirmation(null)} onConfirm={() => confirmation?.action()} />
    {nodeEditing && <NodeEditor departments={departments} functionalRoles={functionalRoles} node={nodeEditing} process={process} onCancel={() => setNodeEditing(null)} onRemoveOutput={removeAnswerOutput} onSave={(node) => { updateNode(node); setNodeEditing(null) }} />}
    {(adding || inserting) && <div className="process-modal-backdrop"><section className="process-modal process-type-picker"><div className="process-modal__heading"><h2>{inserting ? 'Schritt dazwischen einfügen' : 'Nächsten Schritt hinzufügen'}</h2><button className="process-modal__close" type="button" onClick={() => { setAdding(null); setInserting(null) }} aria-label="Modal schließen" title="Schließen">×</button></div><p>{inserting ? 'Der vorhandene Folgeschritt bleibt verbunden.' : 'Wähle den Typ für den nächsten Prozessblock.'}</p>{inserting && <p className="process-type-picker__hint">Bei einer neuen Frage wird der bisherige Folgeschritt automatisch am Weg „Ja“ fortgesetzt. Der Weg „Nein“ bleibt zunächst offen.</p>}<div>{KNOWLEDGE_PROCESS_NODE_TYPES.filter((type) => !inserting || type.value !== 'end').map((type) => <button type="button" key={type.value} onClick={() => addNode(type.value)}><strong>{type.label}</strong>{inserting && type.value === 'decision' && <span>Bestehender Schritt folgt über „Ja“.</span>}</button>)}</div></section></div>}
    {connecting && <div className="process-modal-backdrop"><section className="process-modal process-connect-picker"><div className="process-modal__heading"><h2>Mit bestehendem Schritt verbinden</h2><button className="process-modal__close" type="button" onClick={() => setConnecting(null)} aria-label="Modal schließen" title="Schließen">×</button></div><p>Wähle einen vorhandenen Schritt. Er wird nicht kopiert und kann von mehreren Antwortwegen genutzt werden. Schritte, die zurück zu dieser Frage führen würden, sind nicht auswählbar.</p><div>{connectableNodes.length ? connectableNodes.map((node) => <button type="button" key={node.id} onClick={() => connectToNode(node.id)}><strong>{node.title || 'Unbenannter Block'}</strong><span>{node.type === 'action' ? 'Handlung' : node.type === 'decision' ? 'Frage' : node.type === 'checklist' ? 'Checkliste' : 'Ende'}</span></button>) : <p className="process-connect-picker__empty">Es gibt keinen passenden Block: Alle vorhandenen Schritte würden eine Rückverbindung oder einen Zyklus erzeugen.</p>}</div></section></div>}
    <div className="knowledge-process-page__toolbar"><Link className="button button--secondary" to="/wissen-prozesse">Zur Übersicht</Link>{!editMode && canModify && <button className="button" type="button" onClick={() => setEditing(true)}>Prozess bearbeiten</button>}{editMode && <><button className="button button--secondary" type="button" onClick={() => { setEditing(false); if (isNew) navigate('/wissen-prozesse') }}>Abbrechen</button><button className="button button--secondary" type="button" disabled={saving} onClick={() => save('draft')}>Als Entwurf speichern</button><button className="button" type="button" disabled={saving || validationErrors.length > 0} onClick={() => save('active')}>Freigeben</button></>}{editable && process.status === 'active' && !editMode && <button className="button button--secondary" type="button" onClick={() => setConfirmation({ title: 'Prozess archivieren?', message: 'Der Prozess ist anschließend nur noch für Nutzer mit Bearbeitungsrecht sichtbar.', confirmLabel: 'Archivieren', action: () => save('archived') })}>Archivieren</button>}</div>
    <section className="knowledge-process-head"><div><span className={`process-status process-status--${process.status}`}>{statusLabel(process.status)}</span><h2>{editMode ? <input value={process.title} placeholder="Prozesstitel" onChange={(event) => updateProcess('title', event.target.value)} /> : process.title || 'Unbenannter Prozess'}</h2>{editMode ? <><label className="form-field"><span>Kategorie</span><select value={process.category} onChange={(event) => updateProcess('category', event.target.value)}><option value="">Kategorie auswählen</option>{KNOWLEDGE_PROCESS_CATEGORIES.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label><label className="form-field"><span>Kurzbeschreibung</span><textarea rows="2" value={process.shortDescription} onChange={(event) => updateProcess('shortDescription', event.target.value)} /></label></> : <><p>{process.shortDescription || 'Keine Kurzbeschreibung hinterlegt.'}</p><dl><div><dt>Kategorie</dt><dd>{categoryLabel(process.category)}</dd></div><div><dt>Letzte Änderung</dt><dd>{formatProcessDate(process.updatedAt)} · {process.updatedByName || '—'}</dd></div></dl></>}</div></section>
    {editMode && validationErrors.length > 0 && <section className="process-validation"><strong>Für die Freigabe noch offen</strong><ul>{validationErrors.map((item) => <li key={item}>{item}</li>)}</ul></section>}
    <ProcessFlow process={process} editable={editMode} onAdd={(node, outputId) => setAdding({ node, outputId })} onConnect={(node, outputId) => setConnecting({ node, outputId })} onDisconnect={disconnectAnswerOutput} onInsert={setInserting} onEdit={setNodeEditing} onDelete={(node) => { const incoming = process.edges.filter((edge) => edge.targetId === node.id).length; const outgoing = process.edges.filter((edge) => edge.sourceId === node.id).length; setConfirmation({ title: 'Block löschen?', message: `Es werden ${incoming} eingehende und ${outgoing} ausgehende Verbindung${outgoing === 1 ? '' : 'en'} entfernt. Nicht mehr erreichbare Folgeschritte werden ebenfalls entfernt; gemeinsame Schritte bleiben erhalten.`, confirmLabel: 'Löschen', variant: 'danger', action: () => deleteNode(node) }) }} />
  </div>
}
