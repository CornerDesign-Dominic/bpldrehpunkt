import { lazy, Suspense, useState } from 'react'
import { Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { useLanguage } from '../i18n/useLanguage.js'
import { orderRecordTab, orderRecordTabs, legacyTrackingDetailPath } from '../lib/orderRecordTabs.js'

const Tracking = lazy(() => import('./ShipmentTrackingDetailPage.jsx'))
const Order = lazy(() => import('./TransportOrderDetailPage.jsx'))

function Record() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const { language } = useLanguage()
  const active = orderRecordTab(params.get('tab'))
  const [opened, setOpened] = useState(() => ({ tracking: active === 'tracking', order: active !== 'tracking', lastOrderTab: active === 'tracking' ? 'overview' : active }))
  // Keep visited panels mounted, and retain the last business view while tracking
  // is selected. Opening an order alone does not load the tracking implementation.
  if (active === 'tracking' && !opened.tracking) setOpened({ ...opened, tracking: true })
  if (active !== 'tracking' && (!opened.order || opened.lastOrderTab !== active)) setOpened({ ...opened, order: true, lastOrderTab: active })
  function select(tab) {
    const next = new URLSearchParams(params)
    if (tab === 'overview') next.delete('tab'); else next.set('tab', tab)
    setParams(next, { replace: true, state: location.state })
  }
  const labels = language === 'en'
    ? ['Overview', 'Transport & cargo', 'Business partners', 'Finances', 'Shipment tracking', 'History']
    : ['Übersicht', 'Transport & Ware', 'Geschäftspartner', 'Finanzen', 'Sendungsverfolgung', 'Historie']
  return <div className="order-record">
    <div className="order-workspace__tabs order-record__tabs" role="tablist" aria-label={language === 'en' ? 'Order sections' : 'Auftragsbereiche'}>{orderRecordTabs.map((tab, index) => <button key={tab} type="button" role="tab" id={`order-tab-${tab}`} aria-controls={`order-panel-${tab}`} aria-selected={active === tab} tabIndex={active === tab ? 0 : -1} onClick={() => select(tab)} onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const target = event.key === 'Home' ? 0 : event.key === 'End' ? orderRecordTabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + orderRecordTabs.length) % orderRecordTabs.length
      select(orderRecordTabs[target]); document.getElementById(`order-tab-${orderRecordTabs[target]}`)?.focus()
    }}>{labels[index]}</button>)}</div>
    <Suspense fallback={<p className="page-state">{language === 'en' ? 'Loading …' : 'Wird geladen …'}</p>}>
      {opened.tracking && <div hidden={active !== 'tracking'} id="order-panel-tracking" role="tabpanel" aria-labelledby="order-tab-tracking"><Tracking active={active === 'tracking'} onOpenOrder={() => select('overview')} /></div>}
      {opened.order && <div hidden={active === 'tracking'}><Order active={active !== 'tracking'} showTabs={false} tabOverride={active === 'tracking' ? opened.lastOrderTab : active} /></div>}
    </Suspense>
  </div>
}

export default function TransportOrderRecordPage() {
  const { transportOrderId } = useParams()
  return <Record key={transportOrderId} orderId={transportOrderId} />
}

export function LegacyTrackingDetailRedirect() {
  const { transportOrderId } = useParams()
  const location = useLocation()
  return <Navigate to={legacyTrackingDetailPath(transportOrderId, location.search, location.hash)} state={location.state} replace />
}
