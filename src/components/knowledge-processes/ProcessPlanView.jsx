import { useMemo, useState } from 'react'
import { findNode, outgoingEdges } from '../../lib/knowledgeProcesses.js'

const typeLabels = { action: 'Handlung', decision: 'Frage', checklist: 'Checkliste', end: 'Ende', start: 'Start' }
const answerOutputId = () => `answer_${globalThis.crypto?.randomUUID?.().replaceAll('-', '_') || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`

function orderedNodes(process) {
  const nodes = process.nodes || []
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const start = nodes.find((node) => node.type === 'start')
  if (!start) return nodes
  const seen = new Set(); const ordered = []; const queue = [start.id]
  while (queue.length) {
    const nodeId = queue.shift()
    if (seen.has(nodeId)) continue
    const node = byId.get(nodeId)
    if (!node) continue
    seen.add(nodeId); ordered.push(node)
    for (const edge of outgoingEdges(process, node.id)) queue.push(edge.targetId)
  }
  return [...ordered, ...nodes.filter((node) => !seen.has(node.id))]
}

function checklistItems(node) { return (node.checklistItems || []).map((item) => item?.trim()).filter(Boolean) }

function canReach(process, fromId, targetId) {
  const visited = new Set(); const queue = [fromId]
  while (queue.length) {
    const currentId = queue.shift()
    if (currentId === targetId) return true
    if (visited.has(currentId)) continue
    visited.add(currentId)
    for (const edge of outgoingEdges(process, currentId)) queue.push(edge.targetId)
  }
  return false
}

function InlineProcessEditor({ departments, functionalRoles, node, onAdd, onConnect, onDisconnect, onInsert, onRemoveOutput, onSave, process }) {
  const [value, setValue] = useState(() => structuredClone(node))
  const update = (field, next) => setValue((current) => ({ ...current, [field]: next }))
  const isResponsible = ['action', 'checklist'].includes(value.type)
  const edgeFor = (outputId = '') => outgoingEdges(process, value.id).find((edge) => edge.sourceOutputId === outputId)
  const validTargets = (outputId = '') => {
    const currentTarget = edgeFor(outputId)?.targetId
    return (process.nodes || []).filter((candidate) => candidate.type !== 'start' && candidate.id !== value.id && (candidate.id === currentTarget || !canReach(process, candidate.id, value.id)))
  }
  const submit = (event) => {
    event.preventDefault()
    const department = departments.find((item) => item.id === value.departmentId)
    const functionalRole = functionalRoles.find((item) => item.id === value.functionalRoleId)
    onSave({ ...value, departmentName: department?.name || '', functionalRoleName: functionalRole?.name || '' })
  }
  const connectionControl = (outputId, label) => {
    const edge = edgeFor(outputId)
    return <div className="process-matrix-editor__connection"><label className="form-field"><span>{label}</span><select value={edge?.targetId || ''} onChange={(event) => { if (event.target.value) onConnect(value, outputId, event.target.value) }}><option value="">Bestehenden Schritt auswählen</option>{validTargets(outputId).map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.title || 'Unbenannter Schritt'} · {typeLabels[candidate.type]}</option>)}</select></label>{edge ? <><button type="button" onClick={() => onDisconnect(value, outputId)}>Verbindung lösen</button><button type="button" onClick={() => onInsert({ mode: 'after', edge })}>Davor einfügen</button></> : <button type="button" onClick={() => onAdd(value, outputId)}>Nächsten Schritt hinzufügen</button>}</div>
  }
  return <form className="process-matrix-editor" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
    <div className="process-matrix-editor__fields"><label className="form-field"><span>Schritttitel *</span><input required value={value.title || ''} onChange={(event) => update('title', event.target.value)} /></label><label className="form-field process-matrix-editor__description"><span>Beschreibung</span><textarea rows="3" value={value.description || ''} onChange={(event) => update('description', event.target.value)} /></label>{isResponsible && <><label className="form-field"><span>Abteilung</span><select value={value.departmentId || ''} onChange={(event) => update('departmentId', event.target.value)}><option value="">Keine Abteilung</option>{departments.filter((item) => item.active || item.id === value.departmentId).map((item) => <option key={item.id} value={item.id}>{item.name}{item.active ? '' : ' (inaktiv)'}</option>)}</select></label><label className="form-field"><span>Fachrolle</span><select value={value.functionalRoleId || ''} onChange={(event) => update('functionalRoleId', event.target.value)}><option value="">Keine Fachrolle</option>{functionalRoles.filter((item) => item.active || item.id === value.functionalRoleId).map((item) => <option key={item.id} value={item.id}>{item.name}{item.active ? '' : ' (inaktiv)'}</option>)}</select></label></>}</div>
    {value.type === 'decision' && <section className="process-matrix-editor__section"><strong>Antwortwege</strong>{(value.outputs || []).map((output, index) => <div className="process-matrix-editor__answer" key={output.id}><label className="form-field"><span>{index + 1}. Antwort</span><input required value={output.label || ''} onChange={(event) => update('outputs', value.outputs.map((item) => item.id === output.id ? { ...item, label: event.target.value } : item))} /></label>{connectionControl(output.id, 'Mit bestehendem Schritt verbinden')}<button type="button" className="process-matrix-editor__remove" onClick={() => onRemoveOutput(value, output)}>Antwortweg entfernen</button></div>)}<button className="button button--secondary" type="button" onClick={() => update('outputs', [...(value.outputs || []), { id: answerOutputId(), label: `Antwort ${(value.outputs || []).length + 1}` }])}>Antwortweg hinzufügen</button></section>}
    {value.type === 'checklist' && <section className="process-matrix-editor__section"><strong>Checklistenpunkte</strong>{(value.checklistItems || []).map((item, index) => <div className="process-matrix-editor__checklist" key={`${index}-${item}`}><input value={item} placeholder="Checklistenpunkt" onChange={(event) => update('checklistItems', value.checklistItems.map((entry, itemIndex) => itemIndex === index ? event.target.value : entry))} /><button type="button" onClick={() => update('checklistItems', value.checklistItems.filter((_, itemIndex) => itemIndex !== index))} disabled={value.checklistItems.length === 1}>Entfernen</button></div>)}<button className="button button--secondary" type="button" onClick={() => update('checklistItems', [...(value.checklistItems || []), ''])}>Punkt hinzufügen</button></section>}
    {['action', 'checklist'].includes(value.type) && <section className="process-matrix-editor__section"><strong>Folgeschritt</strong>{connectionControl('', 'Mit bestehendem Schritt verbinden')}</section>}
    <div className="process-matrix-editor__actions"><button className="button" type="submit">Änderungen übernehmen</button></div>
  </form>
}

export default function ProcessPlanView({ departments = [], editable = false, functionalRoles = [], onAdd, onConnect, onDelete, onDisconnect, onInsert, onRemoveOutput, onUpdateNode, process }) {
  const [selectedId, setSelectedId] = useState('')
  const [expandedId, setExpandedId] = useState('')
  const nodes = useMemo(() => orderedNodes(process), [process])
  const incomingCounts = useMemo(() => (process.edges || []).reduce((counts, edge) => ({ ...counts, [edge.targetId]: (counts[edge.targetId] || 0) + 1 }), {}), [process.edges])
  const detailColumns = [
    { key: 'description', label: 'Beschreibung', visible: true, render: (node) => <span className="process-plan__description-text">{node.type === 'start' ? 'Prozessbeginn' : node.description || '—'}</span> },
    { key: 'department', label: 'Verantwortliche Abteilung', visible: nodes.some((node) => Boolean(node.departmentName)), render: (node) => node.departmentName || '—' },
    { key: 'role', label: 'Verantwortliche Fachrolle', visible: nodes.some((node) => Boolean(node.functionalRoleName)), render: (node) => node.functionalRoleName || '—' },
    { key: 'checklist', label: 'Checkliste', visible: nodes.some((node) => checklistItems(node).length > 0), render: (node) => { const items = checklistItems(node); return items.length ? <ul>{items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : '—' } },
  ].filter((column) => column.visible)
  const detailWidth = `${67 / detailColumns.length}%`

  function selectStep(nodeId) {
    setSelectedId(nodeId)
    if (editable) setExpandedId(nodeId)
    globalThis.requestAnimationFrame?.(() => document.getElementById(`ablaufplan-${nodeId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }

  return <section className={`process-plan${editable ? ' process-plan--editable' : ''}`} aria-label="Ablaufplan"><div className="process-plan__matrix-wrap"><table className="process-plan__matrix"><caption className="sr-only">Ablaufplan mit Prozessfluss und Schrittinformationen</caption><colgroup><col className="process-plan__flow-column" /><>{detailColumns.map((column) => <col key={column.key} style={{ width: detailWidth }} />)}</></colgroup><thead><tr className="process-plan__group-heading"><th scope="col" rowSpan="2">Prozessfluss</th><th colSpan={detailColumns.length} id="ablaufplan-heading">Ablaufplan</th></tr><tr>{detailColumns.map((column) => <th scope="col" key={column.key}>{column.label}</th>)}</tr></thead><tbody>{nodes.flatMap((node) => {
    const branches = node.type === 'decision' ? (node.outputs || []).map((output) => ({ label: output.label, target: findNode(process, outgoingEdges(process, node.id).find((edge) => edge.sourceOutputId === output.id)?.targetId) })) : []
    const merged = (incomingCounts[node.id] || 0) > 1
    const canEditNode = editable && node.type !== 'start'
    const edge = outgoingEdges(process, node.id)[0]
    const row = <tr id={`ablaufplan-${node.id}`} key={node.id} tabIndex="-1" className={selectedId === node.id ? 'is-selected' : ''} onClick={() => canEditNode && selectStep(node.id)}>
      <td className={`process-plan__matrix-flow process-plan__matrix-flow--${node.type}`} data-label="Prozessfluss">{node.type === 'start' ? <div className="process-plan__flow-start"><span>Start</span></div> : <button type="button" className={`process-plan__flow-card${selectedId === node.id ? ' is-selected' : ''}`} onClick={(event) => { event.stopPropagation(); selectStep(node.id) }} aria-controls={`ablaufplan-${node.id}`}><span className="process-plan__type">{typeLabels[node.type]}</span><strong>{node.title || 'Unbenannter Schritt'}</strong>{merged && <small>Zusammengeführt · {incomingCounts[node.id]} Wege</small>}</button>}{branches.length > 0 && <div className="process-plan__answers" aria-label={`Antwortwege für ${node.title || 'diese Frage'}`}>{branches.map((branch, index) => <button type="button" key={`${branch.label}-${index}`} onClick={(event) => { event.stopPropagation(); branch.target && selectStep(branch.target.id) }} disabled={!branch.target}><span>{branch.label || 'Unbenannt'}</span><small>→ {branch.target?.title || 'Noch offen'}</small></button>)}</div>}{editable && node.type === 'start' && <div className="process-plan__row-actions"><button type="button" onClick={(event) => { event.stopPropagation(); onAdd(node, '') }}>Nächsten Schritt hinzufügen</button></div>}{canEditNode && <div className="process-plan__row-actions"><button type="button" onClick={(event) => { event.stopPropagation(); selectStep(node.id) }}>Bearbeiten</button><button type="button" onClick={(event) => { event.stopPropagation(); onInsert({ mode: 'before', node }) }}>Davor einfügen</button>{node.type !== 'end' && node.type !== 'decision' && <button type="button" onClick={(event) => { event.stopPropagation(); edge ? onInsert({ mode: 'after', edge }) : onAdd(node, '') }}>Danach einfügen</button>}<button type="button" onClick={(event) => { event.stopPropagation(); selectStep(node.id) }}>Mit bestehendem Schritt verbinden</button><button type="button" className="process-plan__delete-action" onClick={(event) => { event.stopPropagation(); onDelete(node) }}>Löschen</button></div>}</td>
      {detailColumns.map((column) => <td data-label={column.label} key={column.key}>{column.render(node)}</td>)}
    </tr>
    const editorRow = expandedId === node.id && canEditNode ? <tr className="process-plan__editor-row" key={`${node.id}-editor`}><td colSpan={detailColumns.length + 1}><InlineProcessEditor key={`${node.id}-${node.outputs?.length || 0}-${node.checklistItems?.length || 0}`} departments={departments} functionalRoles={functionalRoles} node={node} onAdd={onAdd} onConnect={onConnect} onDisconnect={onDisconnect} onInsert={onInsert} onRemoveOutput={onRemoveOutput} onSave={onUpdateNode} process={process} /></td></tr> : null
    return editorRow ? [row, editorRow] : [row]
  })}</tbody></table></div></section>
}
