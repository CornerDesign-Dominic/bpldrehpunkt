import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listBusinessPartners } from '../../lib/businessPartners.js'
import { createTodo, listTodosForActor } from '../../lib/todos.js'
import { listVisibleUserDirectory } from '../../lib/userProfiles.js'
import { reportTechnicalFailure } from '../../lib/diagnostics.js'
import { assertLinkedTodoCreationContext, createAndRefreshLinkedTodo } from '../../lib/linkedTodoRefresh.js'

export function useLinkedTodos({ canCreate, canViewMasterData, canViewTodos, caseField, caseId, profile, user }) {
  const actor = useMemo(() => ({ user, profile }), [profile, user])
  const [todos, setTodos] = useState([])
  const [loading, setLoading] = useState(canViewTodos)
  const [loadedScope, setLoadedScope] = useState(null)
  const [users, setUsers] = useState([])
  const [partners, setPartners] = useState([])
  const [error, setError] = useState('')
  const [directoryError, setDirectoryError] = useState('')
  const [directoryLoading, setDirectoryLoading] = useState(canCreate)
  const [loadedDirectoryScope, setLoadedDirectoryScope] = useState(null)
  const scope = useMemo(() => ({ actor, caseField, caseId, canViewTodos, canCreate, canViewMasterData }), [actor, caseField, caseId, canViewTodos, canCreate, canViewMasterData])
  const directoryScope = useMemo(() => ({ actor, canCreate, canViewMasterData }), [actor, canCreate, canViewMasterData])
  const currentScope = useRef(null)
  const currentDirectoryScope = useRef(null)
  const listRequest = useRef(0)
  const directoryRequest = useRef(0)
  const usersById = useMemo(() => new Map(users.filter((entry) => entry.active !== false).map((entry) => [entry.id, entry])), [users])

  useEffect(() => {
    currentScope.current = scope
    return () => { if (currentScope.current === scope) currentScope.current = null }
  }, [scope])
  useEffect(() => {
    currentDirectoryScope.current = directoryScope
    return () => { if (currentDirectoryScope.current === directoryScope) currentDirectoryScope.current = null }
  }, [directoryScope])

  const load = useCallback(async () => {
    if (currentScope.current !== scope) return
    const request = ++listRequest.current
    if (!canViewTodos || !caseId) { setTodos([]); setLoading(false); setError(''); setLoadedScope(scope); return }
    setLoading(true)
    try {
      const entries = (await listTodosForActor(actor)).filter((todo) => todo[caseField] === caseId)
      if (currentScope.current === scope && request === listRequest.current) { setTodos(entries); setError(''); setLoadedScope(scope) }
    } catch (loadError) {
      void reportTechnicalFailure({ module: 'case-links', stage: 'load', recordId: caseId, error: loadError })
      if (currentScope.current === scope && request === listRequest.current) { setError('Die verknüpften To-dos konnten nicht geladen werden. Bitte die Liste erneut laden.'); setLoadedScope(scope); throw loadError }
    } finally { if (currentScope.current === scope && request === listRequest.current) setLoading(false) }
  }, [actor, canViewTodos, caseField, caseId, scope])

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
    for (const result of results) if (result.status === 'rejected') void reportTechnicalFailure({ module: 'case-links', stage: 'load', recordId: currentScope.current?.caseId, error: result.reason })
  }, [canCreate, canViewMasterData, directoryScope])

  useEffect(() => {
    let current = true
    const request = ++listRequest.current
    Promise.resolve().then(async () => {
      if (!canViewTodos || !caseId) return []
      return (await listTodosForActor(actor)).filter((todo) => todo[caseField] === caseId)
    }).then((entries) => { if (current && request === listRequest.current) { setTodos(entries); setLoading(false); setError(''); setLoadedScope(scope) } }).catch((loadError) => {
      if (current && request === listRequest.current) { setTodos([]); setLoading(false); setError('Die verknüpften To-dos konnten nicht geladen werden. Bitte die Liste erneut laden.'); setLoadedScope(scope) }
      void reportTechnicalFailure({ module: 'case-links', stage: 'load', recordId: caseId, error: loadError })
    })
    return () => { current = false }
  }, [actor, canViewTodos, caseField, caseId, scope])
  useEffect(() => { void loadDirectory() }, [loadDirectory])

  async function createLinkedTodo(values) {
    assertLinkedTodoCreationContext(values, caseField, caseId, currentScope.current === scope)
    let result
    try { result = await createAndRefreshLinkedTodo(() => createTodo(values, actor, usersById), load) }
    catch (saveError) {
      void reportTechnicalFailure({ module: 'case-links', stage: 'save', recordId: caseId, error: saveError })
      throw saveError
    }
    if (result.refreshError && currentScope.current === scope) setError('Das To-do wurde gespeichert. Die Liste konnte nicht aktualisiert werden. Bitte nur die Liste erneut laden.')
    return result.id
  }

  return { createLinkedTodo, isLinkedTodoContextCurrent: () => currentScope.current === scope, linkedTodoLoading: canViewTodos && (loading || loadedScope !== scope), linkedTodoError: loadedScope === scope ? error : '', reloadLinkedTodos: () => load().catch(() => {}), linkedTodoDirectoryError: loadedDirectoryScope === directoryScope ? directoryError : '', linkedTodoDirectoryLoading: canCreate && (directoryLoading || loadedDirectoryScope !== directoryScope), reloadLinkedTodoDirectory: loadDirectory, linkedTodos: loadedScope === scope ? todos : [], todoPartners: canViewMasterData && loadedDirectoryScope === directoryScope ? partners : [], todoUsers: loadedDirectoryScope === directoryScope ? users : [] }
}
