import { StaticText, TranslatedProps } from '../../i18n/AutoTranslate.jsx'
import { useState } from 'react'
import { allowsNewsReactions, formatNewsDate, getExternalNewsAffects, getExternalNewsTag, getInternalNewsCategory, getNewsCategory, getNewsPriority, getNewsReactionCounts, listNewsUpdates } from '../../lib/news.js'

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

export default function NewsList({ items, loading, readItemIds, laterItemIds, favoriteItemIds, reactionsByItem, reactionUpdatingIds, onMarkRead, onToggleLater, onToggleFavorite, onToggleReaction, onEdit, onArchive, onHide, canEdit }) {
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

  if (loading) return <div className="news-list"><p className="news-list__state"><StaticText source={"News werden geladen …"} /></p></div>
  if (!items.length) return <div className="news-list"><p className="news-list__state"><StaticText source={"Für diese Auswahl sind keine News vorhanden."} /></p></div>

  return <TranslatedProps sources={{"aria-label":"News-Liste"}}><div className="news-list" aria-label="News-Liste">{items.map((item) => {
    const expanded = expandedIds.has(item.id)
    const unread = !readItemIds.has(item.id)
    const later = laterItemIds.has(item.id)
    const favorite = favoriteItemIds.has(item.id)
    const reaction = reactionsByItem[item.id] || null
    const counts = getNewsReactionCounts(item)
    const reactionsEnabled = allowsNewsReactions(item)
    const { content, nextStep } = splitNextStep(item.content)
    const updates = updatesByItem[item.id]
    const priority = item.priority || 'information'
    const entryClassName = `news-entry news-entry--priority-${priority}${unread ? ' news-entry--unread' : ''}`
    return <article id={`news-${item.id}`} className={entryClassName} key={item.id} data-countries={item.affectedCountries?.join(',') || ''} data-tags={item.topicTags?.join(',') || ''} data-affects={item.affects?.join(',') || ''}>
      <div className="news-entry__meta-column"><div className="news-entry__date-row"><time className="news-entry__date">{formatNewsDate(item.publishedAt)}</time>{unread && <><span className="news-entry__unread-dot" aria-hidden="true" /><span className="sr-only"><StaticText source={"Ungelesen"} /></span></>}</div><div className="news-entry__meta-flags"><span className={`news-priority news-priority--${priority}`}>{priority === 'important' && <span className="news-priority__icon" aria-hidden="true">!</span>}{getNewsPriority(priority)}</span>{item.sourceType === 'internal' && <span className="news-entry__internal"><StaticText source={"Intern"} /></span>}</div></div>
      <div className="news-entry__content"><div className="news-entry__heading"><h2 title={item.title}>{compactTitle(item)}</h2></div><p className="news-entry__meta">{getNewsCategory(item.category)}{item.sourceType === 'internal' && ` · ${getInternalNewsCategory(item.internalCategory)}`}{item.source ? ` · ${item.source}` : ''}</p><p className="news-entry__summary">{item.aiSummary || item.summary}</p>{reactionsEnabled && <TranslatedProps sources={{"aria-label":"News-Reaktionen"}}><div className="news-entry__reactions" aria-label="News-Reaktionen"><span><StaticText source={"Hilfreich?"} /></span><TranslatedProps sources={{"aria-label":"Hilfreich","title":"Hilfreich"}}><button className={reaction === 'helpful' ? 'news-entry__reaction news-entry__reaction--active' : 'news-entry__reaction'} type="button" aria-label="Hilfreich" aria-pressed={reaction === 'helpful'} title="Hilfreich" disabled={reactionUpdatingIds.has(item.id)} onClick={() => onToggleReaction(item, 'helpful')}><span aria-hidden="true">👍</span><b>{counts.helpful}</b></button></TranslatedProps><TranslatedProps sources={{"aria-label":"Nicht hilfreich","title":"Nicht hilfreich"}}><button className={reaction === 'notHelpful' ? 'news-entry__reaction news-entry__reaction--active' : 'news-entry__reaction'} type="button" aria-label="Nicht hilfreich" aria-pressed={reaction === 'notHelpful'} title="Nicht hilfreich" disabled={reactionUpdatingIds.has(item.id)} onClick={() => onToggleReaction(item, 'notHelpful')}><span aria-hidden="true">👎</span><b>{counts.notHelpful}</b></button></TranslatedProps></div></TranslatedProps>}</div>
      <TranslatedProps sources={{"aria-label":"Persönliche Merker"}}><div className="news-entry__markers" aria-label="Persönliche Merker"><button className={later ? 'news-entry__marker news-entry__marker--active' : 'news-entry__marker'} type="button" aria-label={later ? 'Später lesen entfernen' : 'Für später lesen markieren'} aria-pressed={later} title={later ? 'Später lesen entfernen' : 'Später lesen'} onClick={() => onToggleLater(item.id)}><svg className="news-entry__bookmark" aria-hidden="true" viewBox="0 0 16 16"><path d="M4 2.5h8v11l-4-2.6-4 2.6z" /></svg></button><button className={favorite ? 'news-entry__marker news-entry__marker--active' : 'news-entry__marker'} type="button" aria-label={favorite ? 'Favorit entfernen' : 'Als Favorit markieren'} aria-pressed={favorite} title={favorite ? 'Favorit entfernen' : 'Favorit'} onClick={() => onToggleFavorite(item.id)}><span aria-hidden="true">{favorite ? '★' : '☆'}</span></button></div></TranslatedProps>
      <button className="news-entry__toggle" type="button" aria-expanded={expanded} aria-controls={`news-details-${item.id}`} onClick={() => toggle(item)}><svg aria-hidden="true" viewBox="0 0 16 16"><path d={expanded ? 'm4 10 4-4 4 4' : 'm4 6 4 4 4-4'} /></svg><span className="sr-only">{<StaticText source={expanded ? 'Meldung einklappen' : 'Meldung aufklappen'} />}</span></button>
      {expanded && <div className="news-entry__expanded" id={`news-details-${item.id}`}>{(item.affectedCountries?.length || item.topicTags?.length || item.affects?.length) && <TranslatedProps sources={{"aria-label":"Kennzeichnungen"}}><div className="news-entry__labels" aria-label="Kennzeichnungen">{item.affectedCountries?.map((country) => <span className="news-entry__label" key={`country-${country}`}>{country}</span>)}{item.topicTags?.map((tag) => <span className="news-entry__label" key={`tag-${tag}`}>{getExternalNewsTag(tag)}</span>)}{item.affects?.map((area) => <span className="news-entry__label news-entry__label--affects" key={`affects-${area}`}><StaticText source={"Betrifft:"} /> {getExternalNewsAffects(area)}</span>)}</div></TranslatedProps>}{content && <p className="news-entry__details">{content}</p>}{updates?.loading && <p className="news-entry__updates-loading"><StaticText source={"Updates werden geladen …"} /></p>}{updates?.items?.length > 0 && <TranslatedProps sources={{"aria-label":"Update-Historie"}}><section className="news-entry__updates" aria-label="Update-Historie"><h3>Updates</h3><ol>{updates.items.map((update) => <li key={update.id}><time>{formatNewsDate(update.changedAt)}</time><span>{update.summary}</span>{update.sourceUrl && <a href={update.sourceUrl} target="_blank" rel="noreferrer"><StaticText source={"Quelle öffnen"} /></a>}</li>)}</ol></section></TranslatedProps>}{nextStep && <p className="news-entry__next-step"><strong><StaticText source={"Nächster Schritt"} /></strong>{nextStep}</p>}<div className="news-entry__actions">{item.sourceUrl && <a className="news-entry__source-link" href={item.sourceUrl} target="_blank" rel="noreferrer"><StaticText source={"Quelle öffnen"} /> <span aria-hidden="true">↗</span></a>}{canEdit && item.sourceType === 'internal' && <button type="button" onClick={() => onEdit(item)}><StaticText source={"Bearbeiten"} /></button>}{canEdit && <button className="news-entry__archive" type="button" onClick={() => item.sourceType === 'external' ? onHide(item) : onArchive(item)}><StaticText source={"Archivieren"} /></button>}</div></div>}
    </article>
  })}</div></TranslatedProps>
}
