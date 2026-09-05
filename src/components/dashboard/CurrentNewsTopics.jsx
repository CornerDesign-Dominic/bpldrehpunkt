import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatNewsCurrentStatus, isNewsCurrent, listNewsItems, NEWS_CATEGORIES, normalizeNewsCategory } from '../../lib/news.js'
import { usePermissions } from '../../auth/usePermissions.js'

const dashboardCategories = NEWS_CATEGORIES.filter((category) => ['traffic_infrastructure', 'law_regulations', 'internal', 'logistics_market'].includes(category.value))

export default function CurrentNewsTopics() {
  const { canView } = usePermissions()
  const [category, setCategory] = useState('traffic_infrastructure')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let current = true
    if (!canView('news')) return () => { current = false }
    listNewsItems()
      .then((loadedItems) => { if (current) setItems(loadedItems) })
      .catch(() => { if (current) setItems([]) })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [canView])

  const currentItems = useMemo(() => items
    .filter((item) => normalizeNewsCategory(item.category) === category && isNewsCurrent(item))
    .slice(0, 4), [category, items])

  return <section className="dashboard-current-news" aria-label="Aktuelle Themen und Fristen">
    <div className="dashboard-current-news__heading"><div><h2>Aktuelle Themen &amp; Fristen</h2></div><Link to={`/news?category=${category}`}>Alle News</Link></div>
    <div className="dashboard-current-news__tabs" role="tablist" aria-label="Kategorie auswählen">{dashboardCategories.map((item) => <button key={item.value} type="button" role="tab" aria-selected={category === item.value} className={category === item.value ? 'dashboard-current-news__tab dashboard-current-news__tab--active' : 'dashboard-current-news__tab'} onClick={() => setCategory(item.value)}>{item.label}</button>)}</div>
    {!canView('news') ? <p className="dashboard-current-news__state">Für News fehlt die Berechtigung.</p> : loading ? <p className="dashboard-current-news__state">Aktuelle Themen werden geladen …</p> : currentItems.length ? <ul className="dashboard-current-news__items">{currentItems.map((item) => <li key={item.id}><Link to={`/news?category=${category}#news-${item.id}`}><span>{item.title}</span><small>{formatNewsCurrentStatus(item)}</small></Link></li>)}</ul> : <p className="dashboard-current-news__state">Derzeit keine aktuellen Themen in dieser Kategorie.</p>}
  </section>
}
