import { useEffect, useMemo, useState } from 'react'
import NewsForm from '../components/news/NewsForm.jsx'
import NewsList from '../components/news/NewsList.jsx'
import NewsMultiSelect from '../components/news/NewsMultiSelect.jsx'
import Toast from '../components/ui/Toast.jsx'
import { useAuth } from '../auth/useAuth.js'
import { usePermissions } from '../auth/usePermissions.js'
import {
  archiveNewsItem,
  createNewsItem,
  EXTERNAL_NEWS_AFFECTS,
  EXTERNAL_NEWS_TAGS,
  getExternalNewsAffects,
  getExternalNewsTag,
  hideExternalNewsItem,
  isNewsInPeriod,
  isNewsNew,
  listNewsCategoryReadStates,
  listNewsItems,
  markNewsCategorySeen,
  NEWS_CATEGORIES,
  normalizeNewsCategory,
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

function timestampMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis()
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'string') return new Date(value).getTime() || 0
  return 0
}

function matchesSelection(values, selected) {
  return selected.length === 0 || values.some((value) => selected.includes(value))
}

export default function NewsPage() {
  const { user } = useAuth()
  const { canEdit } = usePermissions()
  const [items, setItems] = useState([])
  const [category, setCategory] = useState('internal')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [period, setPeriod] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedCountries, setSelectedCountries] = useState([])
  const [selectedTags, setSelectedTags] = useState([])
  const [selectedAffects, setSelectedAffects] = useState([])
  const [categoryReadStates, setCategoryReadStates] = useState({})
  const [readStatesLoaded, setReadStatesLoaded] = useState(false)
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

  useEffect(() => {
    let current = true
    if (!user?.uid) return () => { current = false }
    listNewsCategoryReadStates(user.uid)
      .then((readStates) => { if (current) setCategoryReadStates(readStates) })
      .catch(() => { if (current) setCategoryReadStates({}) })
      .finally(() => { if (current) setReadStatesLoaded(true) })
    return () => { current = false }
  }, [user?.uid])

  useEffect(() => {
    if (!user?.uid || loading || error) return undefined
    let current = true
    markNewsCategorySeen(user.uid, category)
      .then(() => { if (current) setCategoryReadStates((readStates) => ({ ...readStates, [category]: new Date() })) })
      .catch(() => undefined)
    return () => { current = false }
  }, [category, error, loading, user?.uid])

  const categoryItems = useMemo(() => items.filter((item) => item.status === 'active' && normalizeNewsCategory(item.category) === category), [category, items])
  const filterOptions = useMemo(() => {
    const countries = new Set(categoryItems.flatMap((item) => item.affectedCountries || []))
    const tags = new Set(categoryItems.flatMap((item) => item.topicTags || []))
    const affects = new Set(categoryItems.flatMap((item) => item.affects || []))
    return {
      countries: [...countries].sort().map((value) => ({ value, label: value })),
      tags: (EXTERNAL_NEWS_TAGS[category] || []).filter((item) => tags.has(item.value)).map((item) => ({ value: item.value, label: getExternalNewsTag(item.value) })),
      affects: EXTERNAL_NEWS_AFFECTS.filter((item) => affects.has(item.value)).map((item) => ({ value: item.value, label: getExternalNewsAffects(item.value) })),
    }
  }, [category, categoryItems])
  const unreadCounts = useMemo(() => Object.fromEntries(NEWS_CATEGORIES.map((item) => {
    if (!readStatesLoaded || item.value === category) return [item.value, 0]
    const seenAt = timestampMillis(categoryReadStates[item.value])
    const count = items.filter((news) => news.status === 'active' && normalizeNewsCategory(news.category) === item.value && (timestampMillis(news.fetchedAt || news.createdAt) || 1) > seenAt).length
    return [item.value, count]
  })), [category, categoryReadStates, items, readStatesLoaded])
  const visibleItems = useMemo(() => {
    const searchTerm = search.trim().toLocaleLowerCase('de-DE')
    return categoryItems.filter((item) => item.status === 'active'
      && (priorityFilter === 'all' || (priorityFilter === 'new' ? isNewsNew(item) : item.priority === 'important'))
      && isNewsInPeriod(item, period)
      && matchesSelection(item.affectedCountries || [], selectedCountries)
      && matchesSelection(item.topicTags || [], selectedTags)
      && matchesSelection(item.affects || [], selectedAffects)
      && (!searchTerm || [item.title, item.summary, item.content, item.source].some((value) => String(value || '').toLocaleLowerCase('de-DE').includes(searchTerm))))
  }, [categoryItems, period, priorityFilter, search, selectedAffects, selectedCountries, selectedTags])
  const selectedItem = editingItem && editingItem !== 'new' ? editingItem : null
  const hasActiveFilters = priorityFilter !== 'all' || period !== 'all' || search || selectedCountries.length || selectedTags.length || selectedAffects.length

  function selectCategory(nextCategory) {
    setCategory(nextCategory)
    setSelectedCountries([])
    setSelectedTags([])
    setSelectedAffects([])
    setEditingItem(undefined)
  }

  function toggleSelection(setter, value, checked) {
    setter((selected) => checked ? [...selected, value] : selected.filter((item) => item !== value))
  }

  function resetFilters() {
    setPriorityFilter('all')
    setPeriod('all')
    setSearch('')
    setSelectedCountries([])
    setSelectedTags([])
    setSelectedAffects([])
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

  async function hideItem(item) {
    try {
      await hideExternalNewsItem(item)
      await reloadItems()
      setToast('Externe Meldung ausgeblendet.')
    } catch {
      setError('Die Meldung konnte nicht ausgeblendet werden.')
    }
  }

  return <div className="news-page">
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    <section className="news-header-card">
      <div className="news-tabs" role="tablist" aria-label="News-Hauptkategorie">{NEWS_CATEGORIES.map((item) => <button key={item.value} type="button" role="tab" aria-selected={category === item.value} className={category === item.value ? 'news-tabs__tab news-tabs__tab--active' : 'news-tabs__tab'} onClick={() => selectCategory(item.value)}><span className="news-tabs__title">{item.label}</span><span className="news-tabs__description">{item.description}</span>{unreadCounts[item.value] > 0 && <span className="news-tabs__unread" aria-label={`${unreadCounts[item.value]} ungelesene News`}>{unreadCounts[item.value]}</span>}</button>)}</div>
      <div className="news-toolbar"><div className="news-toolbar__filters"><div className="news-filter-group" aria-label="Priorität filtern">{priorityFilters.map((filter) => <button key={filter.value} className={priorityFilter === filter.value ? 'news-filter news-filter--active' : 'news-filter'} type="button" onClick={() => setPriorityFilter(filter.value)}>{filter.label}</button>)}</div><label className="filter-field"><span className="sr-only">Zeitraum filtern</span><select value={period} onChange={(event) => setPeriod(event.target.value)}>{periodFilters.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}</select></label><label className="search-field news-toolbar__search"><span className="sr-only">News durchsuchen</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="News durchsuchen" /></label><NewsMultiSelect label="Länder" options={filterOptions.countries} selected={selectedCountries} onToggle={(value, checked) => toggleSelection(setSelectedCountries, value, checked)} /><NewsMultiSelect label="Tags" options={filterOptions.tags} selected={selectedTags} onToggle={(value, checked) => toggleSelection(setSelectedTags, value, checked)} /><NewsMultiSelect label="Betrifft" options={filterOptions.affects} selected={selectedAffects} onToggle={(value, checked) => toggleSelection(setSelectedAffects, value, checked)} /><button className="news-filter-reset" type="button" disabled={!hasActiveFilters} onClick={resetFilters}>Filter zurücksetzen</button></div>{category === 'internal' && canEdit('news') && <button className="button" type="button" onClick={() => setEditingItem('new')}>Meldung hinzufügen</button>}</div>
      {category !== 'internal' && <div className="news-external-hint"><span>Die automatische Recherche läuft täglich um 07:00 Uhr. Neue, relevante Meldungen werden mit Quelle und KI-Zusammenfassung in dieser Kategorie gespeichert.</span></div>}
    </section>
    {editingItem && <NewsForm key={selectedItem?.id || 'new'} item={selectedItem} onCancel={() => setEditingItem(undefined)} onSubmit={saveItem} />}
    {error && <p className="form-error">{error}</p>}
    <NewsList items={visibleItems} loading={loading} onEdit={setEditingItem} onArchive={archiveItem} onHide={hideItem} canEdit={canEdit('news')} />
  </div>
}
