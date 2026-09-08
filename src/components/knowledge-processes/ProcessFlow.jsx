import { useState } from 'react'
import { ChevronDownIcon, EditIcon, TrashIcon } from '../icons.jsx'
import { findNode, outgoingEdges } from '../../lib/knowledgeProcesses.js'

const typeLabels = { start: 'Start', action: 'Handlung', decision: 'Entscheidung', checklist: 'Checkliste', end: 'Ende' }

function NodeCard({ node, editable, onAdd, onEdit, onDelete, process, visited }) {
  const [checklistOpen, setChecklistOpen] = useState(false)
  const branches = node.type === 'end' ? [] : node.type === 'decision'
    ? (node.outputs || []).map((output) => ({ key: output.id, label: output.label, edge: outgoingEdges(process, node.id).find((edge) => edge.sourceOutputId === output.id) }))
    : [{ key: '', label: '', edge: outgoingEdges(process, node.id)[0] }]
  const hasLoop = visited.has(node.id)
  const nextVisited = new Set(visited).add(node.id)

  return <div className="process-flow__node-wrap">
    <article className={`process-node process-node--${node.type}`}>
      <div className="process-node__topline"><span>{typeLabels[node.type]}</span>{editable && <div className="process-node__actions"><button type="button" onClick={() => onEdit(node)} aria-label={`${node.title} bearbeiten`}><EditIcon /></button>{node.type !== 'start' && <button type="button" onClick={() => onDelete(node)} aria-label={`${node.title} löschen`}><TrashIcon /></button>}</div>}</div>
      <h3>{node.title}</h3>
      {node.description && <p>{node.description}</p>}
      {node.type === 'checklist' && (node.checklistItems || []).filter(Boolean).length > 0 && <div className="process-node__checklist"><button type="button" onClick={() => setChecklistOpen(!checklistOpen)} aria-expanded={checklistOpen}>Checkliste <ChevronDownIcon /></button>{checklistOpen && <ul>{node.checklistItems.filter(Boolean).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>}</div>}
    </article>
    {hasLoop ? <p className="process-flow__invalid">Zirkuläre Verbindung</p> : <div className={node.type === 'decision' ? 'process-flow__branches process-flow__branches--decision' : 'process-flow__branches'}>{branches.map((branch) => {
      const target = branch.edge ? findNode(process, branch.edge.targetId) : null
      return <div className="process-flow__branch" key={branch.key}>
        {node.type === 'decision' && <span className="process-flow__branch-label">{branch.label || 'Unbenannt'}</span>}
        <span className="process-flow__line" aria-hidden="true" />
        {target ? <NodeCard node={target} editable={editable} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} process={process} visited={nextVisited} /> : editable && node.type !== 'end' ? <button type="button" className="process-flow__add" onClick={() => onAdd(node, branch.key)}>Nächsten Schritt hinzufügen</button> : <span className="process-flow__open-end">Noch nicht ergänzt</span>}
      </div>
    })}</div>}
  </div>
}

export default function ProcessFlow({ editable = false, onAdd, onDelete, onEdit, process }) {
  const start = (process.nodes || []).find((node) => node.type === 'start')
  if (!start) return <p className="form-error">Der Startblock fehlt.</p>
  return <section className="process-flow" aria-label="Prozessablauf"><NodeCard node={start} editable={editable} onAdd={onAdd} onEdit={onEdit} onDelete={onDelete} process={process} visited={new Set()} /></section>
}
