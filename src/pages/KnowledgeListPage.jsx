import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import KnowledgeArticleTable from '../components/knowledge/KnowledgeArticleTable.jsx'
import { getKnowledgeCategory, KNOWLEDGE_CATEGORIES, listKnowledgeArticles } from '../lib/knowledge.js'

export default function KnowledgeListPage() {
  const { category: categoryValue } = useParams()
  const category = categoryValue ? getKnowledgeCategory(categoryValue) : null
  const [articles, setArticles] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    listKnowledgeArticles().then(setArticles).catch(() => setError('Die Wissensartikel konnten nicht geladen werden. Bitte Firestore-Zugriff und Verbindung prüfen.')).finally(() => setLoading(false))
  }, [])

  const visibleArticles = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('de-DE')
    return articles.filter((article) => (!categoryValue || article.category === categoryValue) && (!term || [article.title, article.summary, article.content].some((value) => value?.toLocaleLowerCase('de-DE').includes(term))))
  }, [articles, categoryValue, search])

  if (categoryValue && !category) return <section className="page-state page-state--error"><p>Kategorie nicht gefunden.</p><Link className="button button--secondary" to="/wissen">Zur Wissensübersicht</Link></section>

  const counts = Object.fromEntries(KNOWLEDGE_CATEGORIES.map((item) => [item.value, articles.filter((article) => article.category === item.value).length]))
  return <div className="knowledge-page">
    <div className="list-toolbar knowledge-toolbar"><div className="list-controls"><label className="search-field"><span className="sr-only">Wissensartikel suchen</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Wissensartikel suchen" type="search" /></label></div><Link className="button" to="/wissen/artikel/neu">Artikel anlegen</Link></div>
    {error && <p className="form-error">{error}</p>}
    {!category && <section className="knowledge-categories"><div className="knowledge-categories__heading"><h2>Kategorien</h2><span>{articles.length} Artikel</span></div><div className="knowledge-category-list">{KNOWLEDGE_CATEGORIES.map((item) => <Link key={item.value} to={`/wissen/${item.value}`}><span>{item.label}</span><strong>{counts[item.value]}</strong></Link>)}</div></section>}
    {category && <div className="knowledge-list-heading"><div><h2>{category.label}</h2><p>Artikel dieser Kategorie</p></div><Link className="text-button" to="/wissen">Alle Kategorien</Link></div>}
    <KnowledgeArticleTable articles={visibleArticles} loading={loading} showCategory={!category} emptyText={search ? 'Keine passenden Wissensartikel gefunden.' : category ? 'In dieser Kategorie sind noch keine Artikel vorhanden.' : 'Noch keine Wissensartikel vorhanden.'} />
  </div>
}
