import { StaticText, TranslatedProps } from '../../i18n/AutoTranslate.jsx'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import TodoForm from '../todos/TodoForm.jsx'
import { listBusinessPartners } from '../../lib/businessPartners.js'
import { createTodo, listTodosForActor } from '../../lib/todos.js'
import { listVisibleUserDirectory } from '../../lib/userProfiles.js'
import { reportTechnicalFailure } from '../../lib/diagnostics.js'
import { createAndRefreshLinkedTodo } from '../../lib/linkedTodoRefresh.js'

function formatDate(value) {
  return value ? new Intl.DateTimeFormat('de-DE').format(new Date(`${value}T12:00:00`)) : '—'
}

function formatTimestamp(value) {
  const date = value?.toDate?.()
  return date ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : '—'
}

function linksTransportOrder(todo, transportOrderId) {
  return (todo?.transportOrderLinks || []).some((link) => link?.id === transportOrderId) || todo?.transportOrderId === transportOrderId
}

export default function TransportOrderTodosCard({ canCreate = false, canView = false, canViewMasterData = false, order, profile, user }) {
  const navigate = useNavigate()
  const actor = useMemo(() => ({ user, profile }), [profile, user])
  const [loadedTodos, setTodos] = useState([])
  const [loading, setLoading] = useState(canView)
  const [loadedScope, setLoadedScope] = useState(null)
  const [partners, setPartners] = useState([])
  const [users, setUsers] = useState([])
  const [createOpen, setCreateOpen] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const [error, setError] = useState('')
  const [directoryError, setDirectoryError] = useState('')
  const [directoryLoading, setDirectoryLoading] = useState(canCreate)
  const [loadedDirectoryScope, setLoadedDirectoryScope] = useState(null)
  const [creating, setCreating] = useState(false)
  const creatingRef = useRef(false)
  const currentScope = useRef(null)
  const currentDirectoryScope = useRef(null)
  const listRequest = useRef(0)
  const directoryRequest = useRef(0)
  const usersById = useMemo(() => new Map(users.filter((entry) => entry.active !== false).map((entry) => [entry.id, entry])), [users])
  const transportOrderId = order?.id || ''
  const scope = useMemo(() => ({ actor, transportOrderId, canView, canCreate, canViewMasterData }), [actor, transportOrderId, canView, canCreate, canViewMasterData])
  const directoryScope = useMemo(() => ({ actor, canCreate, canViewMasterData }), [actor, canCreate, canViewMasterData])
  const todos = loadedScope === scope ? loadedTodos : []
  const listError = loadedScope === scope ? error : ''
  useEffect(() => {
    currentScope.current = scope
    return () => { if (currentScope.current === scope) currentScope.current = null }
  }, [scope])
  useEffect(() => {
    currentDirectoryScope.current = directoryScope
    return () => { if (currentDirectoryScope.current === directoryScope) currentDirectoryScope.current = null }
  }, [directoryScope])
  const changeSubmitting = useCallback((value) => { creatingRef.current = value; setCreating(value) }, [])
  const closeCreation = useCallback(() => { if (!creatingRef.current && currentScope.current === scope) setCreateOpen(false) }, [scope])
  const initialValues = useMemo(() => ({
    customerId: order?.imported?.customer?.partnerId || '',
    customerName: order?.imported?.customer?.name || '',
    carrierId: order?.imported?.carrier?.partnerId || '',
    carrierName: order?.imported?.carrier?.originalName || '',
    reference: order?.externalNumber || transportOrderId,
    transportOrderLinks: transportOrderId ? [{ id: transportOrderId, number: order?.externalNumber || transportOrderId }] : [],
  }), [order, transportOrderId])

  const load = useCallback(async () => {
    if (currentScope.current !== scope) return
    const request = ++listRequest.current
    if (!canView || !user?.uid || !transportOrderId) {
      setTodos([])
      setLoading(false)
      setError('')
      setLoadedScope(scope)
      return
    }
    setLoading(true)
    try {
      const visibleTodos = await listTodosForActor(actor)
      if (currentScope.current === scope && request === listRequest.current) { setTodos(visibleTodos.filter((todo) => linksTransportOrder(todo, transportOrderId))); setError(''); setLoadedScope(scope) }
    } catch (loadError) {
      void reportTechnicalFailure({ module: 'shipment-tracking', stage: 'load', orderId: transportOrderId, error: loadError })
      if (currentScope.current === scope && request === listRequest.current) { setError('Die verknüpften To-dos konnten nicht geladen werden. Bitte die Liste erneut laden.'); setLoadedScope(scope); throw loadError }
    } finally {
      if (currentScope.current === scope && request === listRequest.current) setLoading(false)
    }
  }, [actor, canView, scope, transportOrderId, user?.uid])

  const loadDirectory = useCallback(async () => {
    if (currentDirectoryScope.current !== directoryScope) return
    const request = ++directoryRequest.current
    setDirectoryLoading(true)
    const results = await Promise.allSettled(canCreate ? [listVisibleUserDirectory(), canViewMasterData ? listBusinessPartners() : Promise.resolve([])] : [Promise.resolve([]), Promise.resolve([])])
    if (currentDirectoryScope.current !== directoryScope || request !== directoryRequest.current) return
    setUsers(results[0].status === 'fulfilled' ? results[0].value : [])
    setPartners(results[1].status === 'fulfilled' ? results[1].value : [])
    setDirectoryError(results.some((result) => result.status === 'rejected') ? 'Die Auswahl für neue To-dos konnte nicht vollständig geladen werden. Bitte die Auswahl erneut laden.' : '')
    setDirectoryLoading(false)
    setLoadedDirectoryScope(directoryScope)
    for (const result of results) if (result.status === 'rejected') void reportTechnicalFailure({ module: 'shipment-tracking', stage: 'load', orderId: currentScope.current?.transportOrderId, error: result.reason })
  }, [canCreate, canViewMasterData, directoryScope])

  useEffect(() => {
    let current = true
    const request = ++listRequest.current
    Promise.resolve().then(async () => {
      if (!canView || !user?.uid || !transportOrderId) return []
      return (await listTodosForActor(actor)).filter((todo) => linksTransportOrder(todo, transportOrderId))
    }).then((entries) => { if (current && request === listRequest.current) { setTodos(entries); setLoading(false); setError(''); setLoadedScope(scope) } }).catch((loadError) => {
      if (current && request === listRequest.current) { setTodos([]); setLoading(false); setError('Die verknüpften To-dos konnten nicht geladen werden. Bitte die Liste erneut laden.'); setLoadedScope(scope) }
      void reportTechnicalFailure({ module: 'shipment-tracking', stage: 'load', orderId: transportOrderId, error: loadError })
    })
    return () => { current = false }
  }, [actor, canView, scope, transportOrderId, user?.uid])

  useEffect(() => { void loadDirectory() }, [loadDirectory])
  useEffect(() => {
    if (!createOpen) return undefined
    const closeOnEscape = (event) => { if (event.key === 'Escape') closeCreation() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [closeCreation, createOpen])

  async function create(values) {
    if (currentScope.current !== scope) throw Object.assign(new Error('Der zugehörige Auftrag wurde inzwischen gewechselt. Bitte das To-do im aktuellen Auftrag neu öffnen.'), { code: 'failed-precondition' })
    let result
    try { result = await createAndRefreshLinkedTodo(() => createTodo(values, actor, usersById), load) }
    catch (saveError) {
      void reportTechnicalFailure({ module: 'shipment-tracking', stage: 'save', orderId: transportOrderId, error: saveError })
      throw saveError
    }
    if (result.refreshError && currentScope.current === scope) setError('Das To-do wurde gespeichert. Die Liste konnte nicht aktualisiert werden. Bitte nur die Liste erneut laden.')
    return result.id
  }

  return <section className="transport-order-detail-section transport-order-todos">
    <h3>To-dos</h3>
    <div className="transport-order-detail-actions__buttons">
      <button className="button button--secondary" type="button" disabled={!canCreate || directoryLoading || loadedDirectoryScope !== directoryScope} title={!canCreate ? 'Sie haben keine Berechtigung, To-dos anzulegen.' : undefined} onClick={() => setCreateOpen(true)}><StaticText source={"To-do anlegen"} /></button>
      {!loading && todos.length > 0 && <button className="button" type="button" onClick={() => setListOpen(true)}><StaticText source={"To-dos ansehen"} /></button>}
    </div>
    {listError && <div role="alert"><p className="form-error"><StaticText source={listError} /></p><button className="button button--secondary" type="button" disabled={loading} onClick={() => { void load().catch(() => {}) }}><StaticText source="Liste erneut laden" /></button></div>}
    {canCreate && loadedDirectoryScope === directoryScope && directoryError && <div role="alert"><p className="form-error"><StaticText source={directoryError} /></p><button className="button button--secondary" type="button" disabled={directoryLoading} onClick={() => { void loadDirectory() }}><StaticText source="Auswahl erneut laden" /></button></div>}
    {createOpen && <div className="todo-modal-backdrop" role="presentation" aria-busy={creating} onMouseDown={(event) => { if (event.target === event.currentTarget) closeCreation() }}><TranslatedProps sources={{"aria-label":"To-do anlegen"}}><section className="todo-form-modal" role="dialog" aria-modal="true" aria-label="To-do anlegen"><TodoForm key={transportOrderId} canViewTransportOrders currentUserId={user?.uid || ''} initialValues={initialValues} partners={partners} users={users} onCancel={closeCreation} onSubmittingChange={changeSubmitting} onSubmit={create} /></section></TranslatedProps></div>}
    {listOpen && createPortal(<div className="todo-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setListOpen(false) }}><section className="todo-details-modal transport-order-todos__modal" role="dialog" aria-modal="true" aria-labelledby="transport-order-todos-modal-title"><div className="todo-details-modal__heading"><h2 id="transport-order-todos-modal-title"><StaticText source={"Verknüpfte To-dos"} /></h2><TranslatedProps sources={{"aria-label":"Dialog schließen","title":"Schließen"}}><button type="button" onClick={() => setListOpen(false)} aria-label="Dialog schließen" title="Schließen">×</button></TranslatedProps></div><div className="todos-table-frame transport-order-todos__table-frame"><table className="data-table transport-order-todos__table"><colgroup><col className="transport-order-todos__column--compact" /><col className="transport-order-todos__column--compact" /><col className="transport-order-todos__column--title" /><col className="transport-order-todos__column--compact" /></colgroup><thead><tr><th><StaticText source={"Von wem"} /></th><th><StaticText source={"Angelegt am"} /></th><th><StaticText source={"Titel"} /></th><th><StaticText source={"Nächste Frist"} /></th></tr></thead><tbody>{todos.map((todo) => <tr key={todo.id} className="transport-order-todos__row" tabIndex="0" role="button" onClick={() => navigate(`/todos/${todo.id}`)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); navigate(`/todos/${todo.id}`) } }} aria-label={`To-do ${todo.title} öffnen`}><td>{todo.creatorName || '—'}</td><td>{formatTimestamp(todo.createdAt)}</td><td>{todo.title || '—'}</td><td>{formatDate(todo.dueDate)}</td></tr>)}</tbody></table></div></section></div>, document.body)}
  </section>
}
