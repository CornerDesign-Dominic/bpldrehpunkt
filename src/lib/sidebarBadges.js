import { isNewsCurrent, listNewsItemPersonalStates, listNewsItems } from './news.js'
import { listTodosForActor, todoDuePresentation } from './todos.js'
import { listManagedVacationData } from './vacationManagement.js'
import { getMainVacationStatus, getVacationRequestKind, getVacationRequestStatus } from './vacationStatus.js'

async function countImportantUnreadNews({ user }) {
  if (!user?.uid) return 0
  const [items, states] = await Promise.all([listNewsItems(), listNewsItemPersonalStates(user.uid)])
  const readItemIds = new Set(states.readItemIds)
  return items.filter((item) => item.priority === 'important' && isNewsCurrent(item) && !readItemIds.has(item.id)).length
}

function needsVacationDecision(request) {
  if (request.status === 'superseded') return false
  return getVacationRequestKind(request) === 'vacation'
    ? getMainVacationStatus(request) === 'pending'
    : getVacationRequestStatus(request) === 'pending'
}

async function countPendingVacationRequests() {
  const data = await listManagedVacationData()
  return data.requests.filter(needsVacationDecision).length
}

async function countDueTodos({ user, profile }) {
  if (!user?.uid) return 0
  const todos = await listTodosForActor({ user, profile })
  return todos.filter((todo) => {
    const { days } = todoDuePresentation(todo)
    return days === 0 || days === 1
  }).length
}

// New sidebar badge types only need a key, semantic variant and a count loader.
export const SIDEBAR_BADGE_DEFINITIONS = {
  news: { variant: 'attention', getCount: countImportantUnreadNews },
  vacationManagement: { variant: 'open', getCount: countPendingVacationRequests },
  todos: { variant: 'urgent', getCount: countDueTodos },
}
