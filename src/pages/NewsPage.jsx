import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import NewsForm from '../components/news/NewsForm.jsx'
import NewsList from '../components/news/NewsList.jsx'
import NewsMultiSelect from '../components/news/NewsMultiSelect.jsx'
import { DrehpunktLogoIcon, ParagraphIcon, TrendUpIcon, TruckFrontIcon } from '../components/icons.jsx'
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

const newsCategoryIcons = {
  internal: DrehpunktLogoIcon,
  traffic_infrastructure: TruckFrontIcon,
  law_regulations: ParagraphIcon,
  logistics_market: TrendUpIcon,
}

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
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const advancedFiltersRef = useRef(null)
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
  useEffect(() => {
    function closeAdvancedFilters(event) {
      if (advancedFiltersRef.current && !advancedFiltersRef.current.contains(event.target)) setShowAdvancedFilters(false)
    }
    function closeOnEscape(event) {
      if (event.key === 'Escape') setShowAdvancedFilters(false)
    }
    document.addEventListener('pointerdown', closeAdvancedFilters)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeAdvancedFilters)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])
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
    <section className="news-category-navigation" aria-labelledby="news-category-navigation-title">
      <h2 id="news-category-navigation-title" className="news-category-navigation__title">News-Bereich</h2>
      <div className="news-tabs" role="tablist" aria-label="News-Hauptkategorie">{NEWS_CATEGORIES.map((item) => {
        const CategoryIcon = newsCategoryIcons[item.value]
        const isActive = category === item.value
        return <button key={item.value} type="button" role="tab" aria-label={`${item.label} auswählen`} aria-selected={isActive} className={isActive ? 'news-tabs__tab news-tabs__tab--active' : 'news-tabs__tab'} onClick={() => selectCategory(item.value)}><span className="news-tabs__content"><span className="news-tabs__icon" aria-hidden="true"><CategoryIcon size={30} /></span><span className="news-tabs__copy"><span className="news-tabs__title">{item.label}</span><span className="news-tabs__description">{item.description}</span></span></span>{unreadCounts[item.value] > 0 && <span className="news-tabs__unread" aria-label={`${unreadCounts[item.value]} ungelesene News`}>{unreadCounts[item.value]}</span>}</button>
      })}</div>
    </section>
    <section className="news-header-card">
      <div className="news-toolbar">
        <div className="news-toolbar__filters">
          <div className="news-toolbar__primary-row">
            <label className="search-field news-toolbar__search"><span className="sr-only">News durchsuchen</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="News durchsuchen" /></label>
            <label className="filter-field news-toolbar__period"><span>Zeitraum:</span><select value={period} onChange={(event) => setPeriod(event.target.value)}>{periodFilters.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}</select></label>
            <div className="news-filter-popover" ref={advancedFiltersRef}>
              <button className={showAdvancedFilters ? 'news-filter-button news-filter-button--active' : 'news-filter-button'} type="button" aria-controls="news-advanced-filters" aria-expanded={showAdvancedFilters} aria-haspopup="dialog" onClick={() => setShowAdvancedFilters((value) => !value)}><svg aria-hidden="true" viewBox="0 0 16 16"><path d="M2 3.25h12l-4.7 5.1v3.55l-2.6.85V8.35L2 3.25Z" /></svg>Filter<span className="news-filter-button__chevron" aria-hidden="true">⌄</span></button>
              {showAdvancedFilters && <section id="news-advanced-filters" className="news-toolbar__advanced-filters" role="dialog" aria-label="Weitere Filter"><div className="news-toolbar__advanced-filter"><span>Länder</span><NewsMultiSelect label="Länder auswählen" options={filterOptions.countries} selected={selectedCountries} onToggle={(value, checked) => toggleSelection(setSelectedCountries, value, checked)} /></div><div className="news-toolbar__advanced-filter"><span>Themen</span><NewsMultiSelect label="Themen auswählen" options={filterOptions.tags} selected={selectedTags} onToggle={(value, checked) => toggleSelection(setSelectedTags, value, checked)} /></div><div className="news-toolbar__advanced-filter"><span>Betrifft Abteilung</span><NewsMultiSelect label="Abteilungen auswählen" options={filterOptions.affects} selected={selectedAffects} onToggle={(value, checked) => toggleSelection(setSelectedAffects, value, checked)} /></div></section>}
            </div>
            {(selectedCountries.length || selectedTags.length || selectedAffects.length) > 0 && <div className="news-filter-chips" aria-label="Ausgewählte Filter">{selectedCountries.map((value) => <button className="news-filter-chip" key={`country-${value}`} type="button" onClick={() => toggleSelection(setSelectedCountries, value, false)}>{value}<span aria-hidden="true">×</span></button>)}{selectedTags.map((value) => <button className="news-filter-chip" key={`tag-${value}`} type="button" onClick={() => toggleSelection(setSelectedTags, value, false)}>{getExternalNewsTag(value)}<span aria-hidden="true">×</span></button>)}{selectedAffects.map((value) => <button className="news-filter-chip" key={`affects-${value}`} type="button" onClick={() => toggleSelection(setSelectedAffects, value, false)}>{getExternalNewsAffects(value)}<span aria-hidden="true">×</span></button>)}</div>}
            {hasActiveFilters && <button className="news-filter-reset" type="button" onClick={resetFilters}><span aria-hidden="true">×</span>Zurücksetzen</button>}
          </div>
          <div className="news-toolbar__quick-row" aria-label="News-Ansichten">
            <div className="news-filter-group">{priorityFilters.map((filter) => <button key={filter.value} className={priorityFilter === filter.value ? 'news-filter news-filter--active' : 'news-filter'} type="button" onClick={() => setPriorityFilter(filter.value)}>{filter.label}</button>)}</div>
            <span className="news-toolbar__quick-divider" aria-hidden="true" />
            <div className="news-toolbar__personal-filters"><button className={showLater ? 'news-filter news-filter--active' : 'news-filter'} type="button" aria-pressed={showLater} onClick={() => setShowLater((value) => !value)}><span aria-hidden="true">🔖</span>Später lesen</button><button className={showFavorites ? 'news-filter news-filter--active' : 'news-filter'} type="button" aria-pressed={showFavorites} onClick={() => setShowFavorites((value) => !value)}><span aria-hidden="true">☆</span>Favoriten</button></div>
          </div>
        </div>
        {category === 'internal' && canEdit('news') && <button className="button" type="button" onClick={() => setEditingItem('new')}>Meldung hinzufügen</button>}
      </div>
      {category !== 'internal' && <div className="news-external-hint"><span>Recherche täglich um 07:00 Uhr · nur quellenbasierte Meldungen.</span></div>}
    </section>
    {editingItem && <NewsForm key={selectedItem?.id || 'new'} item={selectedItem} onCancel={() => setEditingItem(undefined)} onSubmit={saveItem} />}
    {error && <p className="form-error">{error}</p>}
    <NewsList items={visibleItems} loading={loading} readItemIds={readItemIds} laterItemIds={laterItemIds} favoriteItemIds={favoriteItemIds} reactionsByItem={reactionsByItem} reactionUpdatingIds={reactionUpdatingIds} onMarkRead={markItemRead} onToggleLater={(itemId) => toggleItemMarker(itemId, 'later')} onToggleFavorite={(itemId) => toggleItemMarker(itemId, 'favorite')} onToggleReaction={toggleItemReaction} onEdit={setEditingItem} onArchive={archiveItem} onHide={hideItem} canEdit={canEdit('news')} />
  </div>
}
