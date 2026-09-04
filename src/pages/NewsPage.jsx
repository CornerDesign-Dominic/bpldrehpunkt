import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
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
  listNewsItemPersonalStates,
  listNewsItems,
  markNewsItemSeen,
  NEWS_CATEGORIES,
  normalizeNewsCategory,
  setNewsItemReaction,
  setNewsItemMarker,
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

function matchesSelection(values, selected) {
  return selected.length === 0 || values.some((value) => selected.includes(value))
}

export default function NewsPage() {
  const { user } = useAuth()
  const { canEdit } = usePermissions()
  const [searchParams] = useSearchParams()
  const [items, setItems] = useState([])
  const requestedCategory = searchParams.get('category')
  const [category, setCategory] = useState(() => NEWS_CATEGORIES.some((item) => item.value === requestedCategory) ? requestedCategory : 'internal')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [period, setPeriod] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedCountries, setSelectedCountries] = useState([])
  const [selectedTags, setSelectedTags] = useState([])
  const [selectedAffects, setSelectedAffects] = useState([])
  const [readItemIds, setReadItemIds] = useState(new Set())
  const [laterItemIds, setLaterItemIds] = useState(new Set())
  const [favoriteItemIds, setFavoriteItemIds] = useState(new Set())
  const [reactionsByItem, setReactionsByItem] = useState({})
  const [reactionUpdatingIds, setReactionUpdatingIds] = useState(new Set())
  const [readItemsLoaded, setReadItemsLoaded] = useState(false)
  const [showLater, setShowLater] = useState(false)
  const [showFavorites, setShowFavorites] = useState(false)
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
    listNewsItemPersonalStates(user.uid)
      .then((states) => { if (current) { setReadItemIds(new Set(states.readItemIds)); setLaterItemIds(new Set(states.laterItemIds)); setFavoriteItemIds(new Set(states.favoriteItemIds)); setReactionsByItem(states.reactionsByItem) } })
      .catch(() => { if (current) { setReadItemIds(new Set()); setLaterItemIds(new Set()); setFavoriteItemIds(new Set()); setReactionsByItem({}) } })
      .finally(() => { if (current) setReadItemsLoaded(true) })
    return () => { current = false }
  }, [user?.uid])

  const categoryItems = useMemo(() => items.filter((item) => item.status !== 'archived' && normalizeNewsCategory(item.category) === category), [category, items])
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
  const unreadCounts = useMemo(() => Object.fromEntries(NEWS_CATEGORIES.map((item) => [item.value, readItemsLoaded ? items.filter((news) => news.status === 'active' && normalizeNewsCategory(news.category) === item.value && !readItemIds.has(news.id)).length : 0])), [items, readItemIds, readItemsLoaded])
  const visibleItems = useMemo(() => {
    const searchTerm = search.trim().toLocaleLowerCase('de-DE')
    return categoryItems.filter((item) => item.status !== 'archived'
      && (priorityFilter === 'all' || (priorityFilter === 'new' ? isNewsNew(item) : item.priority === 'important'))
      && isNewsInPeriod(item, period)
      && matchesSelection(item.affectedCountries || [], selectedCountries)
      && matchesSelection(item.topicTags || [], selectedTags)
      && matchesSelection(item.affects || [], selectedAffects)
      && (!showLater || laterItemIds.has(item.id))
      && (!showFavorites || favoriteItemIds.has(item.id))
      && (!searchTerm || [item.title, item.summary, item.content, item.source].some((value) => String(value || '').toLocaleLowerCase('de-DE').includes(searchTerm))))
  }, [categoryItems, favoriteItemIds, laterItemIds, period, priorityFilter, search, selectedAffects, selectedCountries, selectedTags, showFavorites, showLater])
  const selectedItem = editingItem && editingItem !== 'new' ? editingItem : null
  const hasActiveFilters = priorityFilter !== 'all' || period !== 'all' || search || selectedCountries.length || selectedTags.length || selectedAffects.length || showLater || showFavorites

  function selectCategory(nextCategory) {
    setCategory(nextCategory)
    setSelectedCountries([])
    setSelectedTags([])
    setSelectedAffects([])
    setShowLater(false)
    setShowFavorites(false)
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
    setShowLater(false)
    setShowFavorites(false)
  }

  async function markItemRead(itemId) {
    if (!user?.uid || readItemIds.has(itemId)) return
    setReadItemIds((itemIds) => new Set([...itemIds, itemId]))
    try {
      await markNewsItemSeen(user.uid, itemId)
    } catch {
      setReadItemIds((itemIds) => new Set([...itemIds].filter((id) => id !== itemId)))
    }
  }

  async function toggleItemMarker(itemId, marker) {
    const [markers, setMarkers] = marker === 'later' ? [laterItemIds, setLaterItemIds] : [favoriteItemIds, setFavoriteItemIds]
    const enabled = !markers.has(itemId)
    setMarkers((itemIds) => new Set(enabled ? [...itemIds, itemId] : [...itemIds].filter((id) => id !== itemId)))
    try {
      await setNewsItemMarker(user?.uid, itemId, marker, enabled)
    } catch {
      setMarkers((itemIds) => new Set(enabled ? [...itemIds].filter((id) => id !== itemId) : [...itemIds, itemId]))
    }
  }

  async function toggleItemReaction(item, reaction) {
    if (reactionUpdatingIds.has(item.id)) return
    const nextReaction = reactionsByItem[item.id] === reaction ? null : reaction
    setReactionUpdatingIds((itemIds) => new Set([...itemIds, item.id]))
    try {
      const result = await setNewsItemReaction(item.id, nextReaction)
      setReactionsByItem((reactions) => {
        const next = { ...reactions }
        if (result.reaction) next[item.id] = result.reaction
        else delete next[item.id]
        return next
      })
      setItems((newsItems) => newsItems.map((newsItem) => newsItem.id === item.id ? { ...newsItem, reactionCounts: result.counts } : newsItem))
    } catch {
      setError('Die Reaktion konnte nicht gespeichert werden.')
    } finally {
      setReactionUpdatingIds((itemIds) => new Set([...itemIds].filter((id) => id !== item.id)))
    }
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
    if (!window.confirm('Diese Meldung wirklich archivieren? Sie wird danach nicht mehr in der News-Liste angezeigt.')) return
    try {
      await archiveNewsItem(item)
      await reloadItems()
      setToast('Interne Meldung archiviert.')
    } catch {
      setError('Die Meldung konnte nicht archiviert werden.')
    }
  }

  async function hideItem(item) {
    if (!window.confirm('Diese Meldung wirklich archivieren? Sie wird danach nicht mehr in der News-Liste angezeigt.')) return
    try {
      await hideExternalNewsItem(item)
      await reloadItems()
      setToast('Externe Meldung archiviert.')
    } catch {
      setError('Die Meldung konnte nicht ausgeblendet werden.')
    }
  }

  return <div className="news-page">
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    <section className="news-header-card">
      <div className="news-tabs" role="tablist" aria-label="News-Hauptkategorie">{NEWS_CATEGORIES.map((item) => <button key={item.value} type="button" role="tab" aria-selected={category === item.value} className={category === item.value ? 'news-tabs__tab news-tabs__tab--active' : 'news-tabs__tab'} onClick={() => selectCategory(item.value)}><span className="news-tabs__title">{item.label}</span><span className="news-tabs__description">{item.description}</span>{unreadCounts[item.value] > 0 && <span className="news-tabs__unread" aria-label={`${unreadCounts[item.value]} ungelesene News`}>{unreadCounts[item.value]}</span>}</button>)}</div>
      <div className="news-toolbar"><div className="news-toolbar__filters"><div className="news-filter-group" aria-label="Priorität filtern">{priorityFilters.map((filter) => <button key={filter.value} className={priorityFilter === filter.value ? 'news-filter news-filter--active' : 'news-filter'} type="button" onClick={() => setPriorityFilter(filter.value)}>{filter.label}</button>)}</div><div className="news-filter-group" aria-label="Persönliche Merker filtern"><button className={showLater ? 'news-filter news-filter--active' : 'news-filter'} type="button" aria-pressed={showLater} onClick={() => setShowLater((value) => !value)}>Später lesen</button><button className={showFavorites ? 'news-filter news-filter--active' : 'news-filter'} type="button" aria-pressed={showFavorites} onClick={() => setShowFavorites((value) => !value)}>Favoriten</button></div><label className="filter-field"><span className="sr-only">Zeitraum filtern</span><select value={period} onChange={(event) => setPeriod(event.target.value)}>{periodFilters.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}</select></label><label className="search-field news-toolbar__search"><span className="sr-only">News durchsuchen</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="News durchsuchen" /></label><NewsMultiSelect label="Länder" options={filterOptions.countries} selected={selectedCountries} onToggle={(value, checked) => toggleSelection(setSelectedCountries, value, checked)} /><NewsMultiSelect label="Tags" options={filterOptions.tags} selected={selectedTags} onToggle={(value, checked) => toggleSelection(setSelectedTags, value, checked)} /><NewsMultiSelect label="Betrifft" options={filterOptions.affects} selected={selectedAffects} onToggle={(value, checked) => toggleSelection(setSelectedAffects, value, checked)} /><button className="news-filter-reset" type="button" disabled={!hasActiveFilters} onClick={resetFilters}>Filter zurücksetzen</button></div>{category === 'internal' && canEdit('news') && <button className="button" type="button" onClick={() => setEditingItem('new')}>Meldung hinzufügen</button>}</div>
      {category !== 'internal' && <div className="news-external-hint"><span>Die automatische Recherche läuft täglich um 07:00 Uhr. Neue, relevante Meldungen werden mit Quelle und KI-Zusammenfassung in dieser Kategorie gespeichert.</span></div>}
    </section>
    {editingItem && <NewsForm key={selectedItem?.id || 'new'} item={selectedItem} onCancel={() => setEditingItem(undefined)} onSubmit={saveItem} />}
    {error && <p className="form-error">{error}</p>}
    <NewsList items={visibleItems} loading={loading} readItemIds={readItemIds} laterItemIds={laterItemIds} favoriteItemIds={favoriteItemIds} reactionsByItem={reactionsByItem} reactionUpdatingIds={reactionUpdatingIds} onMarkRead={markItemRead} onToggleLater={(itemId) => toggleItemMarker(itemId, 'later')} onToggleFavorite={(itemId) => toggleItemMarker(itemId, 'favorite')} onToggleReaction={toggleItemReaction} onEdit={setEditingItem} onArchive={archiveItem} onHide={hideItem} canEdit={canEdit('news')} />
  </div>
}
