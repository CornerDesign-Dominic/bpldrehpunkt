import { useMemo, useState } from 'react'
import { findNode, outgoingEdges } from '../../lib/knowledgeProcesses.js'

const typeLabels = { action: 'Handlung', decision: 'Frage', checklist: 'Checkliste', end: 'Ende', start: 'Start' }

function orderedNodes(process) {
  const nodes = process.nodes || []
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const start = nodes.find((node) => node.type === 'start')
  if (!start) return nodes
  const seen = new Set()
  const ordered = []
  const queue = [start.id]
  while (queue.length) {
    const nodeId = queue.shift()
    if (seen.has(nodeId)) continue
    const node = byId.get(nodeId)
    if (!node) continue
    seen.add(nodeId)
    ordered.push(node)
    for (const edge of outgoingEdges(process, node.id)) queue.push(edge.targetId)
  }
  return [...ordered, ...nodes.filter((node) => !seen.has(node.id))]
}

function checklistItems(node) {
  return (node.checklistItems || []).map((item) => item?.trim()).filter(Boolean)
}

export default function ProcessPlanView({ process }) {
  const [selectedId, setSelectedId] = useState('')
  const nodes = useMemo(() => orderedNodes(process), [process])
  const steps = nodes.filter((node) => node.type !== 'start')
  const incomingCounts = useMemo(() => (process.edges || []).reduce((counts, edge) => ({ ...counts, [edge.targetId]: (counts[edge.targetId] || 0) + 1 }), {}), [process.edges])

  function selectStep(nodeId) {
    setSelectedId(nodeId)
    globalThis.requestAnimationFrame?.(() => document.getElementById(`ablaufplan-${nodeId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }

  return <section className="process-plan" aria-label="Ablaufplan">
    <aside className="process-plan__flow" aria-label="Kompakter Prozessfluss">
      <div className="process-plan__section-heading"><span>Prozessfluss</span><small>Schritt auswählen</small></div>
      <ol className="process-plan__flow-list">
        {nodes.map((node) => {
          const branches = node.type === 'decision'
            ? (node.outputs || []).map((output) => ({ label: output.label, target: findNode(process, outgoingEdges(process, node.id).find((edge) => edge.sourceOutputId === output.id)?.targetId) }))
            : []
          const merged = (incomingCounts[node.id] || 0) > 1
          return <li className={`process-plan__flow-item process-plan__flow-item--${node.type}`} key={node.id}>
            {node.type === 'start' ? <div className="process-plan__flow-start"><span>Start</span></div> : <button type="button" className={`process-plan__flow-card${selectedId === node.id ? ' is-selected' : ''}`} onClick={() => selectStep(node.id)} aria-controls={`ablaufplan-${node.id}`}>
              <span className="process-plan__type">{typeLabels[node.type]}</span>
              <strong>{node.title || 'Unbenannter Schritt'}</strong>
              {merged && <small>Zusammengeführt · {incomingCounts[node.id]} Wege</small>}
            </button>}
            {branches.length > 0 && <div className="process-plan__answers" aria-label={`Antwortwege für ${node.title || 'diese Frage'}`}>{branches.map((branch, index) => <button type="button" key={`${branch.label}-${index}`} onClick={() => branch.target && selectStep(branch.target.id)} disabled={!branch.target}><span>{branch.label || 'Unbenannt'}</span><small>→ {branch.target?.title || 'Noch offen'}</small></button>)}</div>}
          </li>
        })}
      </ol>
    </aside>
    <section className="process-plan__details" aria-labelledby="ablaufplan-heading">
      <div className="process-plan__section-heading"><span id="ablaufplan-heading">Ablaufplan</span><small>{steps.length} {steps.length === 1 ? 'Schritt' : 'Schritte'}</small></div>
      <div className="process-plan__table-wrap"><table className="process-plan__table"><thead><tr><th>Prozessschritt</th><th>Beschreibung</th><th>Verantwortliche Abteilung</th><th>Verantwortliche Fachrolle</th><th>Checkliste</th></tr></thead><tbody>{steps.map((node) => {
        const items = checklistItems(node)
        return <tr id={`ablaufplan-${node.id}`} key={node.id} tabIndex="-1" className={selectedId === node.id ? 'is-selected' : ''}>
          <td><span className="process-plan__table-type">{typeLabels[node.type]}</span><strong>{node.title || 'Unbenannter Schritt'}</strong>{(incomingCounts[node.id] || 0) > 1 && <small className="process-plan__table-merge">Zusammengeführt aus {incomingCounts[node.id]} Wegen</small>}</td>
          <td>{node.description || '—'}</td><td>{node.departmentName || '—'}</td><td>{node.functionalRoleName || '—'}</td>
          <td>{items.length ? <ul>{items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : '—'}</td>
        </tr>
      })}</tbody></table></div>
    </section>
  </section>
}
