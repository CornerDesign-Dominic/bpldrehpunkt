import { useState } from 'react'
import { ChevronDownIcon, EditIcon, TrashIcon } from '../icons.jsx'
import { findNode, outgoingEdges } from '../../lib/knowledgeProcesses.js'

const typeLabels = { start: 'Start', action: 'Handlung', decision: 'Frage', checklist: 'Checkliste', end: 'Ende' }

function NodeCard({ incomingCounts, node, editable, onAdd, onConnect, onDelete, onEdit, onInsert, process, visited }) {
  const [checklistOpen, setChecklistOpen] = useState(false)
  const branches = node.type === 'end' ? [] : node.type === 'decision'
    ? (node.outputs || []).map((output) => ({ key: output.id, label: output.label, edge: outgoingEdges(process, node.id).find((edge) => edge.sourceOutputId === output.id) }))
    : [{ key: '', label: '', edge: outgoingEdges(process, node.id)[0] }]
  const hasLoop = visited.has(node.id)
  const nextVisited = new Set(visited).add(node.id)
  const responsibility = [node.departmentName, node.functionalRoleName].filter(Boolean).join(' · ')
  const incomingCount = incomingCounts[node.id] || 0

  return <div className="process-flow__node-wrap">
    <article className={`process-node process-node--${node.type}`}>
      <div className="process-node__topline"><span>{typeLabels[node.type]}</span>{incomingCount > 1 && <span className="process-node__merge">Zusammengeführt · {incomingCount} Wege</span>}{editable && <div className="process-node__actions"><button type="button" onClick={() => onEdit(node)} aria-label={`${node.title} bearbeiten`}><EditIcon /></button>{node.type !== 'start' && <button type="button" onClick={() => onDelete(node)} aria-label={`${node.title} löschen`}><TrashIcon /></button>}</div>}</div>
      <h3>{node.title}</h3>
      {node.description && <p>{node.description}</p>}
      {responsibility && <p className="process-node__responsibility"><strong>Verantwortlich:</strong> {responsibility}</p>}
      {node.type === 'checklist' && (node.checklistItems || []).filter(Boolean).length > 0 && <div className="process-node__checklist"><button type="button" onClick={() => setChecklistOpen(!checklistOpen)} aria-expanded={checklistOpen}>Checkliste <ChevronDownIcon /></button>{checklistOpen && <ul>{node.checklistItems.filter(Boolean).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>}</div>}
    </article>
    {hasLoop ? <p className="process-flow__invalid">Zirkuläre Verbindung</p> : <div className={node.type === 'decision' ? `process-flow__branches process-flow__branches--decision${branches.length > 2 ? ' process-flow__branches--multiple' : ''}` : 'process-flow__branches'}>{branches.map((branch) => {
      const target = branch.edge ? findNode(process, branch.edge.targetId) : null
      return <div className="process-flow__branch" key={branch.key}>
        {node.type === 'decision' && <span className="process-flow__branch-label">{branch.label || 'Unbenannt'}</span>}
        <span className="process-flow__line" aria-hidden="true" />
        {target ? <>{incomingCounts[target.id] > 1 && <span className="process-flow__merge-hint">führt zu gemeinsamem Schritt</span>}{editable && <button type="button" className="process-flow__insert" onClick={() => onInsert(branch.edge)}>＋ Schritt dazwischen einfügen</button>}<NodeCard incomingCounts={incomingCounts} node={target} editable={editable} onAdd={onAdd} onConnect={onConnect} onEdit={onEdit} onDelete={onDelete} onInsert={onInsert} process={process} visited={nextVisited} /></> : editable && node.type !== 'end' ? <div className="process-flow__open-actions"><button type="button" className="process-flow__add" onClick={() => onAdd(node, branch.key)}>Nächsten Schritt hinzufügen</button>{node.type === 'decision' && <button type="button" className="process-flow__connect" onClick={() => onConnect(node, branch.key)}>Mit bestehendem Schritt verbinden</button>}</div> : <span className="process-flow__open-end">Noch nicht ergänzt</span>}
      </div>
    })}</div>}
  </div>
}

export default function ProcessFlow({ editable = false, onAdd, onConnect, onDelete, onEdit, onInsert, process }) {
  const start = (process.nodes || []).find((node) => node.type === 'start')
  const incomingCounts = (process.edges || []).reduce((counts, edge) => ({ ...counts, [edge.targetId]: (counts[edge.targetId] || 0) + 1 }), {})
  if (!start) return <p className="form-error">Der Startblock fehlt.</p>
  return <section className="process-flow" aria-label="Prozessablauf"><NodeCard incomingCounts={incomingCounts} node={start} editable={editable} onAdd={onAdd} onConnect={onConnect} onEdit={onEdit} onDelete={onDelete} onInsert={onInsert} process={process} visited={new Set()} /></section>
}
