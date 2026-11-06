import { useState } from 'react'
import { useLanguage } from '../../i18n/useLanguage.js'
import { liabilityCall } from '../../lib/liabilityWorkflow.js'
import { reportTechnicalFailure } from '../../lib/diagnostics.js'

export default function LiabilityWordingSuggestion({ text, onAccept }) {
  const { language } = useLanguage()
  const w = (de, en) => language === 'en' ? en : de
  const [busy, setBusy] = useState(false)
  const [suggestion, setSuggestion] = useState(null)
  const [accepted, setAccepted] = useState(null)
  const [error, setError] = useState('')
  async function suggest() {
    setBusy(true); setError(''); setSuggestion(null)
    const source = text
    try {
      const result = await liabilityCall('suggestLiabilityWording', { incidentSummary: source })
      setSuggestion({ source, text: result.incidentText })
    } catch (failure) {
      setError(w('Der Formulierungsvorschlag konnte nicht erstellt werden. Dein Text bleibt erhalten. Bitte erneut versuchen.', 'The wording suggestion could not be created. Your text is preserved. Please try again.'))
      void reportTechnicalFailure({ module: 'document-templates', stage: 'wording', error: failure })
    } finally { setBusy(false) }
  }
  const stale = suggestion && suggestion.source !== text
  return <div className="liability-wording">
    <button type="button" className="button button--ai" disabled={busy || !text.trim() || text.length > 4000} onClick={suggest}>{busy ? w('Vorschlag wird erstellt …', 'Creating suggestion …') : w('Vorschlag für Formulierung', 'Suggest wording')}</button>
    {text.length > 4000 && <p className="form-error">{w('Für den KI-Vorschlag den Sachverhalt auf höchstens 4.000 Zeichen kürzen.', 'Shorten the description to at most 4,000 characters for an AI suggestion.')}</p>}
    {accepted && text === accepted.applied && <button type="button" className="button button--secondary" onClick={() => { onAccept(accepted.original); setAccepted(null) }}>{w('Formulierung rückgängig machen', 'Undo wording change')}</button>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {suggestion && <div className="liability-wording__suggestion" aria-live="polite"><strong>{w('KI-Vorschlag · bitte prüfen', 'AI suggestion · please review')}</strong><p>{suggestion.text}</p>{stale && <p>{w('Der Sachverhalt wurde inzwischen geändert. Bitte einen neuen Vorschlag erstellen.', 'The description has changed. Please create a new suggestion.')}</p>}<div className="liability-order-search"><button type="button" className="button" disabled={stale} onClick={() => { setAccepted({ original: text, applied: suggestion.text }); onAccept(suggestion.text); setSuggestion(null) }}>{w('Formulierung übernehmen', 'Use wording')}</button><button type="button" className="button button--secondary" onClick={() => setSuggestion(null)}>{w('Verwerfen', 'Discard')}</button></div></div>}
  </div>
}
