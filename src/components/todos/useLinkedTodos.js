import { useCallback, useEffect, useMemo, useState } from 'react'
import { listBusinessPartners } from '../../lib/businessPartners.js'
import { createTodo, listTodosForActor } from '../../lib/todos.js'
import { listVisibleUserDirectory } from '../../lib/userProfiles.js'

export function useLinkedTodos({ canCreate, canViewMasterData, canViewTodos, caseField, caseId, profile, user }) {
  const actor = useMemo(() => ({ user, profile }), [profile, user])
  const [todos, setTodos] = useState([])
  const [loading, setLoading] = useState(canViewTodos)
  const [users, setUsers] = useState([])
  const [partners, setPartners] = useState([])
  const usersById = useMemo(() => new Map(users.filter((entry) => entry.active !== false).map((entry) => [entry.id, entry])), [users])

  const load = useCallback(async () => {
    if (!canViewTodos || !caseId) { setTodos([]); setLoading(false); return }
    setLoading(true)
    try { setTodos((await listTodosForActor(actor)).filter((todo) => todo[caseField] === caseId)) } finally { setLoading(false) }
  }, [actor, canViewTodos, caseField, caseId])

  useEffect(() => {
    let current = true
    Promise.resolve().then(async () => {
      if (!canViewTodos || !caseId) return []
      return (await listTodosForActor(actor)).filter((todo) => todo[caseField] === caseId)
    }).then((entries) => { if (current) { setTodos(entries); setLoading(false) } }).catch(() => { if (current) { setTodos([]); setLoading(false) } })
    return () => { current = false }
  }, [actor, canViewTodos, caseField, caseId])
  useEffect(() => {
    let current = true
    if (canCreate) Promise.all([listVisibleUserDirectory(), canViewMasterData ? listBusinessPartners() : Promise.resolve([])]).then(([directory, businessPartners]) => { if (current) { setUsers(directory); setPartners(businessPartners) } }).catch(() => { if (current) { setUsers([]); setPartners([]) } })
    return () => { current = false }
  }, [canCreate, canViewMasterData])

  async function createLinkedTodo(values) {
    await createTodo(values, actor, usersById)
    await load()
  }

  return { createLinkedTodo, linkedTodoLoading: loading, linkedTodos: todos, todoPartners: partners, todoUsers: users }
}
