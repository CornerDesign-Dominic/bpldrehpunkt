import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx'
import Toast from '../components/ui/Toast.jsx'
import ProcessPlanView from '../components/knowledge-processes/ProcessPlanView.jsx'
import { usePermissions } from '../auth/usePermissions.js'
import { listDepartments } from '../lib/departments.js'
import { listFunctionalRoles } from '../lib/functionalRoles.js'
import { KNOWLEDGE_PROCESS_CATEGORIES, KNOWLEDGE_PROCESS_NODE_TYPES, categoryLabel, createEmptyKnowledgeProcess, createKnowledgeProcessNode, formatProcessDate, generateKnowledgeProcessDraft, getKnowledgeProcess, processValidationErrors, saveKnowledgeProcess, statusLabel } from '../lib/knowledgeProcesses.js'
import '../styles/knowledgeProcesses.css'

function AiProcessTemplateModal({ error, initialCategory, initialTitle, onCancel, onGenerate, submitting }) {
  const [description, setDescription] = useState('')
  const [title, setTitle] = useState(initialTitle || '')
  const [category, setCategory] = useState(initialCategory || '')
  return <div className="process-modal-backdrop">
    <form className="process-modal process-ai-template" onSubmit={(event) => { event.preventDefault(); onGenerate({ description, title, category }) }}>
      <div className="process-modal__heading"><h2>Vorlage mit KI erstellen</h2><button className="process-modal__close" type="button" onClick={onCancel} aria-label="Modal schließen" title="Schließen">×</button></div>
      <p>Die KI erstellt einen bearbeitbaren Prozessentwurf. Er wird als Entwurf gespeichert und nicht automatisch freigegeben.</p>
      <label className="form-field"><span>Beschreibe kurz den gewünschten Ablauf / die Situation *</span><textarea required minLength="10" rows="8" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Zum Beispiel: Ablauf bei einer Reklamation nach einer beschädigten Lieferung." disabled={submitting} /></label>
      <div className="process-ai-template__optional"><label className="form-field"><span>Prozessname (optional)</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="KI schlägt einen passenden Namen vor" disabled={submitting} /></label><label className="form-field"><span>Kategorie (optional)</span><select value={category} onChange={(event) => setCategory(event.target.value)} disabled={submitting}><option value="">KI schlägt eine Kategorie vor</option>{KNOWLEDGE_PROCESS_CATEGORIES.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label></div>
      <p className="process-ai-template__notice">Bitte keine Dateien, Namen, Kontaktdaten oder andere personenbezogene Daten eingeben.</p>
      {error && <p className="form-error">{error}</p>}
      <div className="process-modal__actions"><button className="button" type="submit" disabled={submitting || description.trim().length < 10}>{submitting ? 'Entwurf wird erstellt …' : 'Entwurf erstellen'}</button></div>
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
  const [adding, setAdding] = useState(null)
  const [inserting, setInserting] = useState(null)
  const [aiTemplateOpen, setAiTemplateOpen] = useState(false)
  const [aiTemplateError, setAiTemplateError] = useState('')
  const [aiTemplateGenerating, setAiTemplateGenerating] = useState(false)
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
      setProcess((current) => {
        if (inserting.mode === 'before') {
          const targetId = inserting.node.id
          return { ...current, nodes: [...current.nodes, node], edges: [...current.edges.map((edge) => edge.targetId === targetId ? { ...edge, targetId: node.id } : edge), { id: `edge_${node.id}_${type === 'decision' ? 'yes' : 'next'}_${targetId}`, sourceId: node.id, targetId, sourceOutputId: type === 'decision' ? 'yes' : '' }] }
        }
        const edgeToSplit = inserting.edge
        return { ...current, nodes: [...current.nodes, node], edges: current.edges.flatMap((edge) => edge.id === edgeToSplit.id ? [{ ...edge, targetId: node.id }, { id: `edge_${node.id}_${type === 'decision' ? 'yes' : 'next'}_${edgeToSplit.targetId}`, sourceId: node.id, targetId: edgeToSplit.targetId, sourceOutputId: type === 'decision' ? 'yes' : '' }] : [edge]) }
      })
      setInserting(null)
      return
    }
    setProcess((current) => ({ ...current, nodes: [...current.nodes, node], edges: [...current.edges, { id: `edge_${adding.node.id}_${adding.outputId || 'next'}_${node.id}`, sourceId: adding.node.id, targetId: node.id, sourceOutputId: adding.outputId || '' }] }))
    setAdding(null)
  }

  function connectNode(node, outputId, targetId) {
    setProcess((current) => ({
      ...current,
      edges: [
        ...current.edges.filter((edge) => !(edge.sourceId === node.id && edge.sourceOutputId === outputId)),
        { id: `edge_${node.id}_${outputId || 'next'}_${targetId}`, sourceId: node.id, targetId, sourceOutputId: outputId },
      ],
    }))
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

  async function createAiTemplate(values) {
    setAiTemplateGenerating(true)
    setAiTemplateError('')
    try {
      const generatedProcess = await generateKnowledgeProcessDraft(values)
      if (!generatedProcess) throw new Error('Die KI hat keinen Prozessentwurf zurückgegeben.')
      const result = await saveKnowledgeProcess('', generatedProcess, 'draft')
      navigate(`/wissen-prozesse/${result.id}`, { replace: true })
    } catch (templateError) {
      setAiTemplateError(templateError?.message?.replace(/^.*?:\s*/, '') || 'Der Prozessentwurf konnte nicht erstellt werden.')
    } finally {
      setAiTemplateGenerating(false)
    }
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
    {aiTemplateOpen && <AiProcessTemplateModal initialTitle={process.title} initialCategory={process.category} error={aiTemplateError} submitting={aiTemplateGenerating} onCancel={() => { if (!aiTemplateGenerating) { setAiTemplateOpen(false); setAiTemplateError('') } }} onGenerate={createAiTemplate} />}
    {(adding || inserting) && <div className="process-modal-backdrop"><section className="process-modal process-type-picker"><div className="process-modal__heading"><h2>{inserting ? 'Schritt einfügen' : 'Nächsten Schritt hinzufügen'}</h2><button className="process-modal__close" type="button" onClick={() => { setAdding(null); setInserting(null) }} aria-label="Modal schließen" title="Schließen">×</button></div><p>{inserting ? 'Der vorhandene Ablauf bleibt verbunden.' : 'Wähle den Typ für den nächsten Prozessblock.'}</p>{inserting && <p className="process-type-picker__hint">Bei einer neuen Frage wird der bisherige Folgeschritt automatisch am Weg „Ja“ fortgesetzt. Der Weg „Nein“ bleibt zunächst offen.</p>}<div>{KNOWLEDGE_PROCESS_NODE_TYPES.filter((type) => !inserting || type.value !== 'end').map((type) => <button type="button" key={type.value} onClick={() => addNode(type.value)}><strong>{type.label}</strong>{inserting && type.value === 'decision' && <span>Bestehender Schritt folgt über „Ja“.</span>}</button>)}</div></section></div>}
    <div className="knowledge-process-page__toolbar"><Link className="button button--secondary" to="/wissen-prozesse">Zur Übersicht</Link>{isNew && editMode && <button className="button button--secondary" type="button" onClick={() => { setAiTemplateError(''); setAiTemplateOpen(true) }}>Vorlage mit KI erstellen</button>}{!editMode && canModify && <button className="button" type="button" onClick={() => setEditing(true)}>Prozess bearbeiten</button>}{editMode && <><button className="button button--secondary" type="button" onClick={() => { setEditing(false); if (isNew) navigate('/wissen-prozesse') }}>Abbrechen</button><button className="button button--secondary" type="button" disabled={saving} onClick={() => save('draft')}>Als Entwurf speichern</button><button className="button" type="button" disabled={saving || validationErrors.length > 0} onClick={() => save('active')}>Freigeben</button></>}{editable && process.status === 'active' && !editMode && <button className="button button--secondary" type="button" onClick={() => setConfirmation({ title: 'Prozess archivieren?', message: 'Der Prozess ist anschließend nur noch für Nutzer mit Bearbeitungsrecht sichtbar.', confirmLabel: 'Archivieren', action: () => save('archived') })}>Archivieren</button>}</div>
    <section className="knowledge-process-head"><div><span className={`process-status process-status--${process.status}`}>{statusLabel(process.status)}</span><h2>{editMode ? <input value={process.title} placeholder="Prozesstitel" onChange={(event) => updateProcess('title', event.target.value)} /> : process.title || 'Unbenannter Prozess'}</h2>{editMode ? <><label className="form-field"><span>Kategorie</span><select value={process.category} onChange={(event) => updateProcess('category', event.target.value)}><option value="">Kategorie auswählen</option>{KNOWLEDGE_PROCESS_CATEGORIES.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label><label className="form-field"><span>Kurzbeschreibung</span><textarea rows="2" value={process.shortDescription} onChange={(event) => updateProcess('shortDescription', event.target.value)} /></label></> : <><p>{process.shortDescription || 'Keine Kurzbeschreibung hinterlegt.'}</p><dl><div><dt>Kategorie</dt><dd>{categoryLabel(process.category)}</dd></div><div><dt>Letzte Änderung</dt><dd>{formatProcessDate(process.updatedAt)} · {process.updatedByName || '—'}</dd></div></dl></>}</div></section>
    {editMode && validationErrors.length > 0 && <section className="process-validation"><strong>Für die Freigabe noch offen</strong><ul>{validationErrors.map((item) => <li key={item}>{item}</li>)}</ul></section>}
    <ProcessPlanView process={process} editable={editMode} departments={departments} functionalRoles={functionalRoles} onAdd={(node, outputId) => setAdding({ node, outputId })} onConnect={connectNode} onDisconnect={disconnectAnswerOutput} onInsert={setInserting} onRemoveOutput={(node, output) => { const linked = process.edges.some((edge) => edge.sourceId === node.id && edge.sourceOutputId === output.id); setConfirmation({ title: 'Antwortweg entfernen?', message: linked ? 'Der Antwortweg und alle dadurch nicht mehr erreichbaren Folgeschritte werden entfernt.' : 'Der Antwortweg wird entfernt.', confirmLabel: 'Antwortweg entfernen', variant: 'danger', action: () => removeAnswerOutput(node.id, output.id) }) }} onUpdateNode={updateNode} onDelete={(node) => { const incoming = process.edges.filter((edge) => edge.targetId === node.id).length; const outgoing = process.edges.filter((edge) => edge.sourceId === node.id).length; setConfirmation({ title: 'Block löschen?', message: `Es werden ${incoming} eingehende und ${outgoing} ausgehende Verbindung${outgoing === 1 ? '' : 'en'} entfernt. Nicht mehr erreichbare Folgeschritte werden ebenfalls entfernt; gemeinsame Schritte bleiben erhalten.`, confirmLabel: 'Löschen', variant: 'danger', action: () => deleteNode(node) }) }} />
  </div>
}
