import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import TodoForm from '../todos/TodoForm.jsx'
import { listBusinessPartners } from '../../lib/businessPartners.js'
import { createTodo, listTodosForActor } from '../../lib/todos.js'
import { listVisibleUserDirectory } from '../../lib/userProfiles.js'

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
  const [todos, setTodos] = useState([])
  const [loading, setLoading] = useState(canView)
  const [partners, setPartners] = useState([])
  const [users, setUsers] = useState([])
  const [createOpen, setCreateOpen] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const usersById = useMemo(() => new Map(users.filter((entry) => entry.active !== false).map((entry) => [entry.id, entry])), [users])
  const transportOrderId = order?.id || ''
  const initialValues = useMemo(() => ({
    customerId: order?.imported?.customer?.partnerId || '',
    customerName: order?.imported?.customer?.name || '',
    carrierId: order?.imported?.carrier?.partnerId || '',
    carrierName: order?.imported?.carrier?.originalName || '',
    reference: order?.externalNumber || transportOrderId,
    transportOrderLinks: transportOrderId ? [{ id: transportOrderId, number: order?.externalNumber || transportOrderId }] : [],
  }), [order, transportOrderId])

  const load = useCallback(async () => {
    if (!canView || !user?.uid || !transportOrderId) {
      setTodos([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const visibleTodos = await listTodosForActor(actor)
      setTodos(visibleTodos.filter((todo) => linksTransportOrder(todo, transportOrderId)))
    } finally {
      setLoading(false)
    }
  }, [actor, canView, transportOrderId, user?.uid])

  useEffect(() => {
    let current = true
    Promise.resolve().then(async () => {
      if (!canView || !user?.uid || !transportOrderId) return []
      return (await listTodosForActor(actor)).filter((todo) => linksTransportOrder(todo, transportOrderId))
    }).then((entries) => { if (current) { setTodos(entries); setLoading(false) } }).catch(() => { if (current) { setTodos([]); setLoading(false) } })
    return () => { current = false }
  }, [actor, canView, transportOrderId, user?.uid])

  useEffect(() => {
    let current = true
    if (canCreate) Promise.all([listVisibleUserDirectory(), canViewMasterData ? listBusinessPartners() : Promise.resolve([])]).then(([directory, businessPartners]) => { if (current) { setUsers(directory); setPartners(businessPartners) } }).catch(() => { if (current) { setUsers([]); setPartners([]) } })
    return () => { current = false }
  }, [canCreate, canViewMasterData])

  async function create(values) {
    await createTodo(values, actor, usersById)
    await load()
  }

  return <section className="transport-order-detail-section transport-order-todos">
    <h3>To-dos</h3>
    <div className="transport-order-detail-actions__buttons">
      <button className="button button--secondary" type="button" disabled={!canCreate} title={!canCreate ? 'Sie haben keine Berechtigung, To-dos anzulegen.' : undefined} onClick={() => setCreateOpen(true)}>To-do anlegen</button>
      {!loading && todos.length > 0 && <button className="button" type="button" onClick={() => setListOpen(true)}>To-dos ansehen</button>}
    </div>
    {createOpen && <div className="todo-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateOpen(false) }}><section className="todo-form-modal" role="dialog" aria-modal="true" aria-label="To-do anlegen"><TodoForm canViewTransportOrders currentUserId={user?.uid || ''} initialValues={initialValues} partners={partners} users={users} onCancel={() => setCreateOpen(false)} onSubmit={create} /></section></div>}
    {listOpen && createPortal(<div className="todo-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setListOpen(false) }}><section className="todo-details-modal transport-order-todos__modal" role="dialog" aria-modal="true" aria-labelledby="transport-order-todos-modal-title"><div className="todo-details-modal__heading"><h2 id="transport-order-todos-modal-title">Verknüpfte To-dos</h2><button type="button" onClick={() => setListOpen(false)} aria-label="Dialog schließen" title="Schließen">×</button></div><div className="todos-table-frame transport-order-todos__table-frame"><table className="data-table transport-order-todos__table"><colgroup><col className="transport-order-todos__column--compact" /><col className="transport-order-todos__column--compact" /><col className="transport-order-todos__column--title" /><col className="transport-order-todos__column--compact" /></colgroup><thead><tr><th>Von wem</th><th>Angelegt am</th><th>Titel</th><th>Nächste Frist</th></tr></thead><tbody>{todos.map((todo) => <tr key={todo.id} className="transport-order-todos__row" tabIndex="0" role="button" onClick={() => navigate(`/todos/${todo.id}`)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); navigate(`/todos/${todo.id}`) } }} aria-label={`To-do ${todo.title} öffnen`}><td>{todo.creatorName || '—'}</td><td>{formatTimestamp(todo.createdAt)}</td><td>{todo.title || '—'}</td><td>{formatDate(todo.dueDate)}</td></tr>)}</tbody></table></div></section></div>, document.body)}
  </section>
}
