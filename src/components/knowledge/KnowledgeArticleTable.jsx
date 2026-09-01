import { Link } from 'react-router-dom'
import { getKnowledgeCategory } from '../../lib/knowledge.js'

function formatDate(value) {
  const date = value?.toDate?.() ?? value
  return date ? new Intl.DateTimeFormat('de-DE').format(date) : '—'
}

export default function KnowledgeArticleTable({ articles, loading, showCategory = true, emptyText }) {
  return <div className="table-frame knowledge-article-table"><table><thead><tr><th>Artikel</th>{showCategory && <th>Kategorie</th>}<th>Aktualisiert</th><th>Öffnen</th></tr></thead><tbody>
    {loading ? <tr><td className="table-state" colSpan={showCategory ? 4 : 3}>Wissensartikel werden geladen …</td></tr> : articles.length ? articles.map((article) => <tr key={article.id}><td><strong>{article.title}</strong>{article.summary && <span className="table-subline">{article.summary}</span>}</td>{showCategory && <td>{getKnowledgeCategory(article.category)?.label || '—'}</td>}<td>{formatDate(article.updatedAt || article.createdAt)}</td><td className="table-action"><Link to={`/wissen/artikel/${article.id}`}>Öffnen</Link></td></tr>) : <tr><td className="table-state" colSpan={showCategory ? 4 : 3}>{emptyText}</td></tr>}
  </tbody></table></div>
}
