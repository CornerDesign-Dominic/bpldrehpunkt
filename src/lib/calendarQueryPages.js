// Complete the last date before choosing the next ten appointments. Otherwise
// a page boundary can hide an earlier time on the same day.
export async function calendarWindowAndUpcoming(readWindow, readUpcomingPage, isUpcomingCandidate = () => true) {
  const [window, firstPage] = await Promise.all([readWindow(), readUpcomingPage(null)])
  const upcoming = [...firstPage]
  const candidates = firstPage.filter(isUpcomingCandidate)
  let page = firstPage
  while (page.length === 20 && (candidates.length < 10 || page.at(-1).data().startDate === candidates[9].data().startDate)) {
    page = await readUpcomingPage(page.at(-1))
    upcoming.push(...page)
    candidates.push(...page.filter(isUpcomingCandidate))
  }
  return [...new Map([...window, ...upcoming].map((item) => [item.id, item])).values()]
}
