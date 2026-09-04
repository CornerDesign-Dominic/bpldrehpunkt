import { useState } from 'react'
import { formatNewsDate, getExternalNewsAffects, getExternalNewsTag, getInternalNewsCategory, getNewsCategory, getNewsPriority } from '../../lib/news.js'

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

export default function NewsList({ items, loading, readItemIds, onMarkRead, onEdit, onArchive, onHide, canEdit }) {
  const [expandedIds, setExpandedIds] = useState(new Set())

  function toggle(item) {
    const expanded = !expandedIds.has(item.id)
    setExpandedIds((ids) => {
      const next = new Set(ids)
      if (expanded) next.add(item.id)
      else next.delete(item.id)
      return next
    })
    if (expanded && !readItemIds.has(item.id)) onMarkRead(item.id)
  }

  if (loading) return <div className="news-list"><p className="news-list__state">News werden geladen …</p></div>
  if (!items.length) return <div className="news-list"><p className="news-list__state">Für diese Auswahl sind keine News vorhanden.</p></div>

  return <div className="news-list" aria-label="News-Liste">{items.map((item) => {
    const expanded = expandedIds.has(item.id)
    const unread = !readItemIds.has(item.id)
    const { content, nextStep } = splitNextStep(item.content)
    return <article className={unread ? 'news-entry news-entry--unread' : 'news-entry'} key={item.id} data-countries={item.affectedCountries?.join(',') || ''} data-tags={item.topicTags?.join(',') || ''} data-affects={item.affects?.join(',') || ''}>
      <time className="news-entry__date">{formatNewsDate(item.publishedAt)}</time>
      <div className="news-entry__content"><div className="news-entry__heading"><h2 title={item.title}>{compactTitle(item)}</h2><div><span className={`news-priority news-priority--${item.priority}`}>{getNewsPriority(item.priority)}</span>{item.sourceType === 'internal' && <span className="news-entry__internal">Intern</span>}</div></div><p className="news-entry__meta">{getNewsCategory(item.category)}{item.sourceType === 'internal' && ` · ${getInternalNewsCategory(item.internalCategory)}`}{item.source ? ` · ${item.source}` : ''}</p><p className="news-entry__summary">{item.aiSummary || item.summary}</p></div>
      <button className="news-entry__toggle" type="button" aria-expanded={expanded} aria-controls={`news-details-${item.id}`} onClick={() => toggle(item)}><span aria-hidden="true">{expanded ? '⌃' : '⌄'}</span><span className="sr-only">{expanded ? 'Meldung einklappen' : 'Meldung aufklappen'}</span></button>
      {expanded && <div className="news-entry__expanded" id={`news-details-${item.id}`}>{(item.affectedCountries?.length || item.topicTags?.length || item.affects?.length) && <div className="news-entry__labels" aria-label="Kennzeichnungen">{item.affectedCountries?.map((country) => <span className="news-entry__label" key={`country-${country}`}>{country}</span>)}{item.topicTags?.map((tag) => <span className="news-entry__label" key={`tag-${tag}`}>{getExternalNewsTag(tag)}</span>)}{item.affects?.map((area) => <span className="news-entry__label news-entry__label--affects" key={`affects-${area}`}>Betrifft: {getExternalNewsAffects(area)}</span>)}</div>}{content && <p className="news-entry__details">{content}</p>}{nextStep && <p className="news-entry__next-step"><strong>Nächster Schritt</strong>{nextStep}</p>}<div className="news-entry__actions">{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">Quelle öffnen</a>}{canEdit && item.sourceType === 'internal' && <><button type="button" onClick={() => onEdit(item)}>Bearbeiten</button><button className="news-entry__archive" type="button" onClick={() => onArchive(item)}>Archivieren</button></>}{canEdit && item.sourceType === 'external' && <button className="news-entry__archive" type="button" onClick={() => onHide(item)}>Ausblenden</button>}</div></div>}
    </article>
  })}</div>
}
