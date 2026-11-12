// Calendar projections are re-authorized on each load. Recheck when returning
// to the calendar and periodically while it is visible, including changes made
// by another employee while this page remains open.
export function subscribeCalendarRefresh({ window, document, onRefresh, intervalMs = 30_000 }) {
  const refreshIfVisible = () => { if (document.visibilityState !== 'hidden') onRefresh() }
  window.addEventListener('focus', refreshIfVisible)
  document.addEventListener('visibilitychange', refreshIfVisible)
  const interval = window.setInterval(refreshIfVisible, intervalMs)
  return () => {
    window.clearInterval(interval)
    window.removeEventListener('focus', refreshIfVisible)
    document.removeEventListener('visibilitychange', refreshIfVisible)
  }
}
