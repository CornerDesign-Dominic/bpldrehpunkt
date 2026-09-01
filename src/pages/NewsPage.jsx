import { useEffect, useMemo, useState } from 'react'
import NewsForm from '../components/news/NewsForm.jsx'
import NewsList from '../components/news/NewsList.jsx'
import Toast from '../components/ui/Toast.jsx'
import {
  archiveNewsItem,
  createNewsItem,
  isNewsInPeriod,
  isNewsNew,
  listNewsItems,
  NEWS_CATEGORIES,
  updateNewsItem,
} from '../lib/news.js'

const priorityFilters = [
  { value: 'all', label: 'Alle' },
  { value: 'new', label: 'Neu' },
  { value: 'important', label: 'Wichtig' },
]

const periodFilters = [
  { value: 'today', label: 'Heute' },
  { value: '7days', label: '7 Tage' },
  { value: '30days', label: '30 Tage' },
  { value: 'all', label: 'Alle' },
]

export default function NewsPage() {
  const [items, setItems] = useState([])
  const [category, setCategory] = useState('internal')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [period, setPeriod] = useState('all')
  const [editingItem, setEditingItem] = useState(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  async function reloadItems() {
    const loadedItems = await listNewsItems()
    setItems(loadedItems)
  }

  useEffect(() => {
    let current = true
    listNewsItems().then((loadedItems) => { if (current) setItems(loadedItems) }).catch(() => { if (current) setError('Die News konnten nicht geladen werden. Bitte Firestore-Zugriff und Verbindung prüfen.') }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [])

  const visibleItems = useMemo(() => items.filter((item) => item.status === 'active' && item.category === category && (priorityFilter === 'all' || (priorityFilter === 'new' ? isNewsNew(item) : item.priority === 'important')) && isNewsInPeriod(item, period)), [category, items, period, priorityFilter])
  const selectedItem = editingItem && editingItem !== 'new' ? editingItem : null

  function selectCategory(nextCategory) {
    setCategory(nextCategory)
    setEditingItem(undefined)
  }

  async function saveItem(values) {
    try {
      if (selectedItem) await updateNewsItem(selectedItem.id, values)
      else await createNewsItem(values)
      await reloadItems()
      setEditingItem(undefined)
      setToast(selectedItem ? 'Interne Meldung aktualisiert.' : 'Interne Meldung angelegt.')
    } catch (saveError) {
      setError('Die Meldung konnte nicht gespeichert werden.')
      throw saveError
    }
  }

  async function archiveItem(item) {
    try {
      await archiveNewsItem(item)
      await reloadItems()
      setToast('Interne Meldung archiviert.')
    } catch {
      setError('Die Meldung konnte nicht archiviert werden.')
    }
  }

  return <div className="news-page">
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    <div className="news-tabs" role="tablist" aria-label="News-Kategorien">{NEWS_CATEGORIES.map((item) => <button key={item.value} type="button" role="tab" aria-selected={category === item.value} className={category === item.value ? 'news-tabs__tab news-tabs__tab--active' : 'news-tabs__tab'} onClick={() => selectCategory(item.value)}>{item.label}</button>)}</div>
    <div className="news-toolbar"><div className="news-toolbar__filters"><div className="news-filter-group" aria-label="Priorität filtern">{priorityFilters.map((filter) => <button key={filter.value} className={priorityFilter === filter.value ? 'news-filter news-filter--active' : 'news-filter'} type="button" onClick={() => setPriorityFilter(filter.value)}>{filter.label}</button>)}</div><label className="filter-field"><span className="sr-only">Zeitraum filtern</span><select value={period} onChange={(event) => setPeriod(event.target.value)}>{periodFilters.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}</select></label></div>{category === 'internal' && <button className="button" type="button" onClick={() => setEditingItem('new')}>Meldung hinzufügen</button>}</div>
    {category !== 'internal' && <p className="news-external-hint">Externe News können später automatisiert importiert werden. Quelle, Link, Veröffentlichungszeitpunkt, KI-Zusammenfassung und Relevanz sind bereits im Datenmodell vorgesehen.</p>}
    {editingItem && <NewsForm key={selectedItem?.id || 'new'} item={selectedItem} onCancel={() => setEditingItem(undefined)} onSubmit={saveItem} />}
    {error && <p className="form-error">{error}</p>}
    <NewsList items={visibleItems} loading={loading} onEdit={setEditingItem} onArchive={archiveItem} />
  </div>
}
