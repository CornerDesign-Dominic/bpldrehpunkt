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
  const incomingCounts = useMemo(() => (process.edges || []).reduce((counts, edge) => ({ ...counts, [edge.targetId]: (counts[edge.targetId] || 0) + 1 }), {}), [process.edges])

  function selectStep(nodeId) {
    setSelectedId(nodeId)
    globalThis.requestAnimationFrame?.(() => {
      const row = document.getElementById(`ablaufplan-${nodeId}`)
      row?.focus({ preventScroll: true })
      row?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  return <section className="process-plan" aria-label="Ablaufplan">
    <div className="process-plan__matrix-wrap"><table className="process-plan__matrix"><caption className="sr-only">Ablaufplan mit Prozessfluss und Schrittinformationen</caption><colgroup><col className="process-plan__flow-column" /><col className="process-plan__description-column" /><col className="process-plan__department-column" /><col className="process-plan__role-column" /><col className="process-plan__checklist-column" /></colgroup><thead><tr className="process-plan__group-heading"><th scope="col" rowSpan="2">Prozessfluss</th><th colSpan="4" id="ablaufplan-heading">Ablaufplan</th></tr><tr><th scope="col">Beschreibung</th><th scope="col">Verantwortliche Abteilung</th><th scope="col">Verantwortliche Fachrolle</th><th scope="col">Checkliste</th></tr></thead><tbody>{nodes.map((node) => {
        const items = checklistItems(node)
        const branches = node.type === 'decision'
          ? (node.outputs || []).map((output) => ({ label: output.label, target: findNode(process, outgoingEdges(process, node.id).find((edge) => edge.sourceOutputId === output.id)?.targetId) }))
          : []
        const merged = (incomingCounts[node.id] || 0) > 1
        return <tr id={`ablaufplan-${node.id}`} key={node.id} tabIndex="-1" className={selectedId === node.id ? 'is-selected' : ''}>
          <td className={`process-plan__matrix-flow process-plan__matrix-flow--${node.type}`} data-label="Prozessfluss">{node.type === 'start' ? <div className="process-plan__flow-start"><span>Start</span></div> : <button type="button" className={`process-plan__flow-card${selectedId === node.id ? ' is-selected' : ''}`} onClick={() => selectStep(node.id)} aria-controls={`ablaufplan-${node.id}`}><span className="process-plan__type">{typeLabels[node.type]}</span><strong>{node.title || 'Unbenannter Schritt'}</strong>{merged && <small>Zusammengeführt · {incomingCounts[node.id]} Wege</small>}</button>}{branches.length > 0 && <div className="process-plan__answers" aria-label={`Antwortwege für ${node.title || 'diese Frage'}`}>{branches.map((branch, index) => <button type="button" key={`${branch.label}-${index}`} onClick={() => branch.target && selectStep(branch.target.id)} disabled={!branch.target}><span>{branch.label || 'Unbenannt'}</span><small>→ {branch.target?.title || 'Noch offen'}</small></button>)}</div>}</td>
          <td data-label="Beschreibung">{node.type === 'start' ? 'Prozessbeginn' : node.description || '—'}</td><td data-label="Verantwortliche Abteilung">{node.departmentName || '—'}</td><td data-label="Verantwortliche Fachrolle">{node.functionalRoleName || '—'}</td>
          <td data-label="Checkliste">{items.length ? <ul>{items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : '—'}</td>
        </tr>
      })}</tbody></table></div>
  </section>
}
