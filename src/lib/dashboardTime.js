import { canEdit, canView } from './permissions.js'

export function dashboardTimeAccess(profile) {
  const visible = profile?.active === true && canView(profile, 'timeTracking')
  return { visible, editable: visible && canEdit(profile, 'timeTracking') }
}

export function createDashboardTimeSession({ userId, editable, getOnline, getDate, load, stamp, uuid, now }) {
  let live = false
  let generation = 0
  let notify = () => {}
  let state = { workspace: null, loading: true, busy: false, error: '', notice: '' }
  const publish = (update) => { state = { ...state, ...update }; if (live) notify(state) }
  async function refresh() {
    const request = ++generation
    await Promise.resolve()
    if (!live) return null
    if (!getOnline()) { publish({ loading: false }); return null }
    const date = getDate()
    try {
      const workspace = await load({ ownOnly: true, from: date, to: date })
      if (!live || request !== generation || date !== getDate()) return null
      if (workspace?.user?.id !== userId) throw new Error('Die Zeitdaten gehören nicht zum angemeldeten Konto. Bitte neu laden.')
      publish({ workspace, loading: false, error: '' })
      return workspace
    } catch (error) {
      if (live && request === generation) publish({ loading: false, error: error.message || 'Zeitdaten konnten nicht geladen werden.' })
      return null
    }
  }
  async function record(type) {
    const day = state.workspace?.days?.find(item => item.date === getDate())
    const status = day?.status || 'away'
    const allowed = type === 'come' ? status === 'away' : type === 'pause_start' ? status === 'working' : type === 'pause_end' ? status === 'break' : type === 'go' && status !== 'away'
    if (!live || !editable || !getOnline() || state.loading || state.busy || !state.workspace || !allowed) return false
    ++generation
    publish({ busy: true, error: '', notice: '' })
    let accepted = false
    try {
      await stamp({ expectedUserId: userId, eventId: uuid(), type, at: now().toISOString(), offline: false })
      accepted = true
      if (live) publish({ notice: 'Buchung gespeichert.' })
    } catch (error) {
      if (live) publish({ error: error.message || 'Buchung konnte nicht bestätigt werden. Bitte den aktuellen Stand prüfen.' })
    }
    // Also reload after a lost response: a server-accepted stamp must not be
    // repeated just because its original response did not reach this browser.
    const errorBeforeRefresh = state.error
    const fresh = await refresh()
    if (live) publish({ busy: false, ...(!accepted && fresh ? { error: errorBeforeRefresh } : {}) })
    return accepted
  }
  return {
    snapshot: () => state,
    isActive: () => live,
    activate(callback) { live = true; notify = callback; ++generation },
    dispose() { live = false; ++generation; notify = () => {} },
    refresh,
    record,
  }
}
