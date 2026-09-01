import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import KnowledgeArticleForm from '../components/knowledge/KnowledgeArticleForm.jsx'
import Toast from '../components/ui/Toast.jsx'
import { createEmptyKnowledgeArticle, createKnowledgeArticle, getKnowledgeArticle, updateKnowledgeArticle } from '../lib/knowledge.js'

export default function KnowledgeArticleDetailPage({ mode }) {
  const { articleId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [article, setArticle] = useState(mode === 'create' ? createEmptyKnowledgeArticle() : null)
  const [loading, setLoading] = useState(mode === 'existing')
  const [submitting, setSubmitting] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState(location.state?.toast ?? '')

  useEffect(() => {
    if (mode === 'create') return undefined
    let current = true
    getKnowledgeArticle(articleId)
      .then((item) => { if (current) { setArticle(item); if (!item) setError('Der Wissensartikel wurde nicht gefunden.') } })
      .catch(() => { if (current) setError('Der Wissensartikel konnte nicht geladen werden.') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [articleId, mode])

  async function submit(values) {
    setSubmitting(true)
    setError('')
    try {
      const savedId = mode === 'create' ? await createKnowledgeArticle(values) : (await updateKnowledgeArticle(articleId, values), articleId)
      if (mode === 'create') navigate(`/wissen/artikel/${savedId}`, { state: { toast: 'Wissensartikel erfolgreich angelegt.' } })
      else { setArticle((current) => ({ ...current, ...values })); setToast('Änderungen gespeichert.') }
      return true
    } catch {
      setError('Speichern nicht möglich. Bitte Firestore-Zugriff und Verbindung prüfen.')
      return false
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <p className="page-state">Wissensartikel wird geladen …</p>
  if (error && !article) return <section className="page-state page-state--error"><p>{error}</p><Link className="button button--secondary" to="/wissen">Zur Wissensübersicht</Link></section>

  return <div className="knowledge-article-detail-page">
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    <header className="masterdata-header"><div className="masterdata-header__identity"><h2>{article.title || 'Neuer Wissensartikel'}</h2>{mode === 'existing' && <div className="detail-header__meta"><span>Wissensartikel</span></div>}</div><div className="masterdata-header__actions"><Link className="button button--secondary" to="/wissen">Zur Übersicht</Link>{dirty && <span className="dirty-hint">Ungespeicherte Änderungen</span>}<button className="button" type="submit" form="knowledge-article-form" disabled={submitting || (mode === 'existing' && !dirty)}>{submitting ? 'Wird gespeichert …' : mode === 'create' ? 'Artikel anlegen' : 'Speichern'}</button></div></header>
    {error && <p className="form-error">{error}</p>}
    <KnowledgeArticleForm key={`${articleId ?? 'new'}-${article.id ?? 'draft'}`} formId="knowledge-article-form" initialValue={article} onSubmit={submit} onDirtyChange={setDirty} />
  </div>
}
