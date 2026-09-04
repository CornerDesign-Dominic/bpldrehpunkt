import { formatNewsDate, getExternalNewsAffects, getExternalNewsTag, getInternalNewsCategory, getNewsCategory, getNewsPriority } from '../../lib/news.js'

export default function NewsList({ items, loading, onEdit, onArchive, onHide, canEdit }) {
  if (loading) return <div className="news-list"><p className="news-list__state">News werden geladen …</p></div>
  if (!items.length) return <div className="news-list"><p className="news-list__state">Für diese Auswahl sind keine News vorhanden.</p></div>

  return <div className="news-list" aria-label="News-Liste">{items.map((item) => <article className="news-entry" key={item.id} data-countries={item.affectedCountries?.join(',') || ''} data-tags={item.topicTags?.join(',') || ''} data-affects={item.affects?.join(',') || ''}>
    <time className="news-entry__date">{formatNewsDate(item.publishedAt)}</time>
    <div className="news-entry__content"><div className="news-entry__heading"><h2>{item.title}</h2><div><span className={`news-priority news-priority--${item.priority}`}>{getNewsPriority(item.priority)}</span>{item.sourceType === 'internal' && <span className="news-entry__internal">Intern</span>}</div></div>
      <p className="news-entry__meta">{getNewsCategory(item.category)}{item.sourceType === 'internal' && ` · ${getInternalNewsCategory(item.internalCategory)}`}{item.source ? ` · ${item.source}` : ''}</p>
      {item.sourceType === 'external' && (item.affectedCountries?.length || item.topicTags?.length || item.affects?.length) && <div className="news-entry__labels" aria-label="Kennzeichnungen">{item.affectedCountries?.map((country) => <span className="news-entry__label" key={`country-${country}`}>{country}</span>)}{item.topicTags?.map((tag) => <span className="news-entry__label" key={`tag-${tag}`}>{getExternalNewsTag(tag)}</span>)}{item.affects?.map((area) => <span className="news-entry__label news-entry__label--affects" key={`affects-${area}`}>Betrifft: {getExternalNewsAffects(area)}</span>)}</div>}
      <p className="news-entry__summary">{item.aiSummary || item.summary}</p>
      {item.content && <p className="news-entry__details">{item.content}</p>}
      <div className="news-entry__actions">{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">Quelle öffnen</a>}{canEdit && item.sourceType === 'internal' && <><button type="button" onClick={() => onEdit(item)}>Bearbeiten</button><button className="news-entry__archive" type="button" onClick={() => onArchive(item)}>Archivieren</button></>}{canEdit && item.sourceType === 'external' && <button className="news-entry__archive" type="button" onClick={() => onHide(item)}>Ausblenden</button>}</div>
    </div>
  </article>)}</div>
}
