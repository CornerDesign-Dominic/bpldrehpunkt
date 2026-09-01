import { formatNewsDate, getNewsCategory, getNewsPriority } from '../../lib/news.js'

export default function NewsList({ items, loading, onEdit, onArchive }) {
  if (loading) return <div className="news-list"><p className="news-list__state">News werden geladen …</p></div>
  if (!items.length) return <div className="news-list"><p className="news-list__state">Für diese Auswahl sind keine News vorhanden.</p></div>

  return <div className="news-list" aria-label="News-Liste">{items.map((item) => <article className="news-entry" key={item.id}>
    <time className="news-entry__date">{formatNewsDate(item.publishedAt)}</time>
    <div className="news-entry__content"><div className="news-entry__heading"><h2>{item.title}</h2><div><span className={`news-priority news-priority--${item.priority}`}>{getNewsPriority(item.priority)}</span>{item.sourceType === 'internal' && <span className="news-entry__internal">Intern</span>}</div></div>
      <p className="news-entry__meta">{getNewsCategory(item.category)}{item.source ? ` · ${item.source}` : ''}</p>
      <p className="news-entry__summary">{item.aiSummary || item.summary}</p>
      {item.content && <p className="news-entry__details">{item.content}</p>}
      <div className="news-entry__actions">{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">Quelle öffnen</a>}{item.sourceType === 'internal' && <><button type="button" onClick={() => onEdit(item)}>Bearbeiten</button><button className="news-entry__archive" type="button" onClick={() => onArchive(item)}>Archivieren</button></>}</div>
    </div>
  </article>)}</div>
}
