import { useState } from 'react'
import { formatNewsDate, getExternalNewsAffects, getExternalNewsTag, getInternalNewsCategory, getNewsCategory, getNewsPriority, listNewsUpdates } from '../../lib/news.js'

function compactTitle(item) {
  const title = String(item.title || '').trim()
  if (item.sourceType !== 'external' || title.length <= 92) return title
  return `${title.slice(0, 89).replace(/[\s,;:–-]+$/, '')}…`
}

function splitNextStep(content) {
  const value = String(content || '').trim()
  const match = value.match(/^(.*?)(?:\s+(?:nächster schritt|handlungshinweis)\s*:?\s*)(.+)$/i)
  return match ? { content: match[1].trim(), nextStep: match[2].trim() } : { content: value, nextStep: '' }
}

export default function NewsList({ items, loading, readItemIds, laterItemIds, favoriteItemIds, onMarkRead, onToggleLater, onToggleFavorite, onEdit, onArchive, onHide, canEdit }) {
  const [expandedIds, setExpandedIds] = useState(new Set())
  const [updatesByItem, setUpdatesByItem] = useState({})

  async function toggle(item) {
    const expanded = !expandedIds.has(item.id)
    setExpandedIds((ids) => {
      const next = new Set(ids)
      if (expanded) next.add(item.id)
      else next.delete(item.id)
      return next
    })
    if (expanded && !readItemIds.has(item.id)) onMarkRead(item.id)
    if (expanded && !updatesByItem[item.id]) {
      setUpdatesByItem((updates) => ({ ...updates, [item.id]: { loading: true, items: [] } }))
      try {
        const updates = await listNewsUpdates(item.id)
        setUpdatesByItem((itemsById) => ({ ...itemsById, [item.id]: { loading: false, items: updates } }))
      } catch {
        setUpdatesByItem((itemsById) => ({ ...itemsById, [item.id]: { loading: false, items: [] } }))
      }
    }
  }

  if (loading) return <div className="news-list"><p className="news-list__state">News werden geladen …</p></div>
  if (!items.length) return <div className="news-list"><p className="news-list__state">Für diese Auswahl sind keine News vorhanden.</p></div>

  return <div className="news-list" aria-label="News-Liste">{items.map((item) => {
    const expanded = expandedIds.has(item.id)
    const unread = !readItemIds.has(item.id)
    const later = laterItemIds.has(item.id)
    const favorite = favoriteItemIds.has(item.id)
    const { content, nextStep } = splitNextStep(item.content)
    const updates = updatesByItem[item.id]
    return <article id={`news-${item.id}`} className={unread ? 'news-entry news-entry--unread' : 'news-entry'} key={item.id} data-countries={item.affectedCountries?.join(',') || ''} data-tags={item.topicTags?.join(',') || ''} data-affects={item.affects?.join(',') || ''}>
      <time className="news-entry__date">{formatNewsDate(item.publishedAt)}</time>
      <div className="news-entry__content"><div className="news-entry__heading"><h2 title={item.title}>{compactTitle(item)}</h2><div><span className={`news-priority news-priority--${item.priority}`}>{getNewsPriority(item.priority)}</span>{item.sourceType === 'internal' && <span className="news-entry__internal">Intern</span>}</div></div><p className="news-entry__meta">{getNewsCategory(item.category)}{item.sourceType === 'internal' && ` · ${getInternalNewsCategory(item.internalCategory)}`}{item.source ? ` · ${item.source}` : ''}</p><p className="news-entry__summary">{item.aiSummary || item.summary}</p></div>
      <div className="news-entry__markers" aria-label="Persönliche Merker"><button className={later ? 'news-entry__marker news-entry__marker--active' : 'news-entry__marker'} type="button" aria-label={later ? 'Später lesen entfernen' : 'Für später lesen markieren'} aria-pressed={later} title={later ? 'Später lesen entfernen' : 'Später lesen'} onClick={() => onToggleLater(item.id)}><span aria-hidden="true">🔖</span></button><button className={favorite ? 'news-entry__marker news-entry__marker--active' : 'news-entry__marker'} type="button" aria-label={favorite ? 'Favorit entfernen' : 'Als Favorit markieren'} aria-pressed={favorite} title={favorite ? 'Favorit entfernen' : 'Favorit'} onClick={() => onToggleFavorite(item.id)}><span aria-hidden="true">{favorite ? '★' : '☆'}</span></button></div>
      <button className="news-entry__toggle" type="button" aria-expanded={expanded} aria-controls={`news-details-${item.id}`} onClick={() => toggle(item)}><span aria-hidden="true">{expanded ? '⌃' : '⌄'}</span><span className="sr-only">{expanded ? 'Meldung einklappen' : 'Meldung aufklappen'}</span></button>
      {expanded && <div className="news-entry__expanded" id={`news-details-${item.id}`}>{(item.affectedCountries?.length || item.topicTags?.length || item.affects?.length) && <div className="news-entry__labels" aria-label="Kennzeichnungen">{item.affectedCountries?.map((country) => <span className="news-entry__label" key={`country-${country}`}>{country}</span>)}{item.topicTags?.map((tag) => <span className="news-entry__label" key={`tag-${tag}`}>{getExternalNewsTag(tag)}</span>)}{item.affects?.map((area) => <span className="news-entry__label news-entry__label--affects" key={`affects-${area}`}>Betrifft: {getExternalNewsAffects(area)}</span>)}</div>}{content && <p className="news-entry__details">{content}</p>}{updates?.loading && <p className="news-entry__updates-loading">Updates werden geladen …</p>}{updates?.items?.length > 0 && <section className="news-entry__updates" aria-label="Update-Historie"><h3>Updates</h3><ol>{updates.items.map((update) => <li key={update.id}><time>{formatNewsDate(update.changedAt)}</time><span>{update.summary}</span>{update.sourceUrl && <a href={update.sourceUrl} target="_blank" rel="noreferrer">Quelle öffnen</a>}</li>)}</ol></section>}{nextStep && <p className="news-entry__next-step"><strong>Nächster Schritt</strong>{nextStep}</p>}<div className="news-entry__actions">{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">Quelle öffnen</a>}{canEdit && item.sourceType === 'internal' && <><button type="button" onClick={() => onEdit(item)}>Bearbeiten</button><button className="news-entry__archive" type="button" onClick={() => onArchive(item)}>Archivieren</button></>}{canEdit && item.sourceType === 'external' && <button className="news-entry__archive" type="button" onClick={() => onHide(item)}>Ausblenden</button>}</div></div>}
    </article>
  })}</div>
}
