import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { httpsCallable } from 'firebase/functions'
import Toast from '../components/ui/Toast.jsx'
import { functions } from '../lib/firebase.js'
import '../styles/admin.css'

function clonePrompt(prompt) {
  return { ...prompt, draft: { ...prompt.draft }, published: { ...prompt.published } }
}

export default function AiPromptsPage() {
  const [prompts, setPrompts] = useState([])
  const [editing, setEditing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  useEffect(() => {
    let active = true
    httpsCallable(functions, 'listAiPromptConfigs')()
      .then((result) => {
        if (!active) return
        const loaded = result.data?.prompts || []
        setPrompts(loaded)
        setEditing(loaded[0] ? clonePrompt(loaded[0]) : null)
      })
      .catch(() => { if (active) setError('KI-Prompts konnten nicht geladen werden.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  function replacePrompt(nextPrompt) {
    setPrompts((current) => current.map((prompt) => prompt.id === nextPrompt.id ? nextPrompt : prompt))
    setEditing(clonePrompt(nextPrompt))
  }

  async function run(action, successMessage) {
    if (!editing) return
    setSaving(true)
    setError('')
    try {
      const result = await httpsCallable(functions, action)(action === 'saveAiPromptDraft' ? { id: editing.id, instructions: editing.draft.instructions } : { id: editing.id })
      replacePrompt(result.data.prompt)
      setToast(successMessage)
    } catch (requestError) {
      setError(requestError?.message?.replace(/^.*?:\s*/, '') || 'Die KI-Prompt-Konfiguration konnte nicht gespeichert werden.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <section className="admin-page"><p>KI-Prompts werden geladen …</p></section>

  return <div className="admin-page ai-prompts-page">
    {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    <div className="system-mails-page__toolbar"><Link className="button button--secondary" to="/admin">Zum Adminbereich</Link></div>
    {error && <p className="form-error">{error}</p>}
    <section className="ai-prompts-workspace">
      <aside className="ai-prompts-list"><div className="ai-prompts-list__heading"><h2>KI-Funktionen</h2></div>{prompts.map((prompt) => <button key={prompt.id} className={prompt.id === editing?.id ? 'ai-prompts-list__item ai-prompts-list__item--active' : 'ai-prompts-list__item'} type="button" onClick={() => { setEditing(clonePrompt(prompt)); setError('') }}>{prompt.displayName}</button>)}</aside>
      {editing && <section className="ai-prompts-editor">
        <div><h2>{editing.displayName}</h2><p>{editing.description}</p></div>
        <div className="ai-prompts-editor__notice"><strong>Geschützter Kern</strong><span>Extraktion, Datenvalidierung, Output-Schema und Sicherheitsvorgaben sind nicht bearbeitbar und haben immer Vorrang.</span></div>
        <label className="form-field ai-prompts-editor__field"><span>Entwurf – ergänzende Fachanweisung</span><textarea rows="14" maxLength="5000" value={editing.draft.instructions} onChange={(event) => setEditing((current) => ({ ...current, draft: { ...current.draft, instructions: event.target.value } }))} /></label>
        <div className="ai-prompts-editor__actions"><button className="button button--secondary" type="button" disabled={saving} onClick={() => { void run('resetAiPromptDraft', 'Entwurf auf den sicheren Standard zurückgesetzt.') }}>Standard wiederherstellen</button><button className="button button--secondary" type="button" disabled={saving} onClick={() => { void run('saveAiPromptDraft', 'Entwurf gespeichert.') }}>Entwurf speichern</button><button className="button" type="button" disabled={saving} onClick={() => { void run('publishAiPromptDraft', 'Entwurf veröffentlicht. Neue KI-Aufrufe verwenden ihn sofort.') }}>Veröffentlichen</button></div>
        <section className="ai-prompts-editor__published"><h3>Aktiv veröffentlichte Fassung</h3><p>{editing.published.instructions}</p></section>
      </section>}
    </section>
  </div>
}
