import { useCallback, useEffect, useRef, useState } from 'react'
import { getTransportOrderTrackingHistoryPage } from './transportOrderWorkspace.js'

export function useOrderTrackingHistory(orderId, enabled) {
  const [page, setPage] = useState({ events: [], hasMore: false, cursor: null, loading: false, error: false })
  const generation = useRef(0)
  const invalidate = useCallback(() => { generation.current++ }, [])
  const load = useCallback(async (cursor = null) => {
    const request = ++generation.current
    setPage(previous => ({ ...previous, loading: true, error: false }))
    try {
      const next = await getTransportOrderTrackingHistoryPage(orderId, cursor)
      if (request === generation.current) setPage(previous => ({ ...next, events: cursor ? [...previous.events, ...next.events].filter((entry, index, entries) => entries.findIndex(item => item.id === entry.id) === index) : next.events, loading: false, error: false }))
    } catch {
      if (request === generation.current) setPage(previous => ({ ...previous, loading: false, error: true }))
    }
  }, [orderId])
  useEffect(() => {
    let current = true
    if (enabled) void Promise.resolve().then(() => { if (current) return load() })
    return () => { current = false; invalidate() }
  }, [load, enabled, invalidate])
  return { ...page, retry: () => load(), more: () => { if (!page.loading && page.hasMore) return load(page.cursor) } }
}
