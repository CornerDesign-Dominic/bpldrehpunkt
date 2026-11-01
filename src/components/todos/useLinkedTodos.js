import { useCallback, useEffect, useMemo, useState } from 'react'
import { listBusinessPartners } from '../../lib/businessPartners.js'
import { createTodo, listTodosForActor } from '../../lib/todos.js'
import { listVisibleUserDirectory } from '../../lib/userProfiles.js'
import { saveAndRefresh } from '../../lib/saveAndRefresh.js'
import { reportTechnicalFailure } from '../../lib/diagnostics.js'
import { useLanguage } from '../../i18n/useLanguage.js'

export function useLinkedTodos({ canCreate, canViewMasterData, canViewTodos, caseField, caseId, profile, user }) {
  const { language } = useLanguage()
  const actor = useMemo(() => ({ user, profile }), [profile, user])
  const [todos, setTodos] = useState([])
  const [loading, setLoading] = useState(canViewTodos)
  const [users, setUsers] = useState([])
  const [partners, setPartners] = useState([])
  const [loadError, setLoadError] = useState('')
  const usersById = useMemo(() => new Map(users.filter((entry) => entry.active !== false).map((entry) => [entry.id, entry])), [users])

  const load = useCallback(async () => {
    if (!canViewTodos || !caseId) { setTodos([]); setLoading(false); return }
    setLoading(true)
    setLoadError('')
    try { setTodos((await listTodosForActor(actor)).filter((todo) => todo[caseField] === caseId)) }
    catch (error) { setLoadError(language === 'en' ? 'The current linked tasks could not be loaded. Please try loading again.' : 'Die aktuellen verknüpften To-dos konnten nicht geladen werden. Bitte erneut laden.'); void reportTechnicalFailure({ module: 'website', stage: 'other', error }); throw error }
    finally { setLoading(false) }
  }, [actor, canViewTodos, caseField, caseId, language])

  useEffect(() => {
    let current = true
    Promise.resolve().then(async () => {
      if (!canViewTodos || !caseId) return []
      return (await listTodosForActor(actor)).filter((todo) => todo[caseField] === caseId)
    }).then((entries) => { if (current) { setTodos(entries); setLoading(false); setLoadError('') } }).catch((error) => { if (current) { setTodos([]); setLoading(false); setLoadError(language === 'en' ? 'Linked tasks could not be loaded. Please load again.' : 'Verknüpfte To-dos konnten nicht geladen werden. Bitte erneut laden.'); void reportTechnicalFailure({ module: 'website', stage: 'other', error }) } })
    return () => { current = false }
  }, [actor, canViewTodos, caseField, caseId, language])
  useEffect(() => {
    let current = true
    if (canCreate) Promise.all([listVisibleUserDirectory(), canViewMasterData ? listBusinessPartners() : Promise.resolve([])]).then(([directory, businessPartners]) => { if (current) { setUsers(directory); setPartners(businessPartners) } }).catch(() => { if (current) { setUsers([]); setPartners([]) } })
    return () => { current = false }
  }, [canCreate, canViewMasterData])

  async function createLinkedTodo(values) {
    const saved = await saveAndRefresh(() => createTodo(values, actor, usersById), load)
    return saved.result
  }

  return { createLinkedTodo, linkedTodoError: loadError, reloadLinkedTodos: load, linkedTodoLoading: loading, linkedTodos: todos, todoPartners: partners, todoUsers: users }
}
