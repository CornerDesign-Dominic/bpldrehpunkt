import { useRef, useState } from 'react'
import { analyzeCustomerOrderTerms } from '../lib/agbChecker.js'
import { ChevronDownIcon, CloseIcon, DocumentSearchIcon } from '../components/icons.jsx'
import '../styles/agbChecker.css'

const MAX_FILE_SIZE = 20 * 1024 * 1024
const sections = [
  ['customer', 'Kunde'], ['billing', 'Abrechnung'], ['pallets', 'Paletten'], ['costs', 'Kosten & Sanktionen'],
]
const statusLabel = { found: 'Gefunden', not_found: 'Nicht gefunden', unclear: 'Unklar' }
const confidenceLabel = { high: 'Eindeutig', medium: 'Mit Einschränkung', low: 'Niedrige Sicherheit' }

function formatSize(size) { return `${(size / (1024 * 1024)).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB` }
function errorMessage(error) { return error?.message?.replace(/^.*?:\s*/, '') || 'Die Prüfung konnte nicht gestartet werden. Bitte versuche es erneut.' }

function SourceDisclosure({ sourceText }) {
  const [isExpanded, setExpanded] = useState(false)
  return <div className={`agb-source${isExpanded ? ' agb-source--expanded' : ''}`}>
    <button className="agb-source__toggle" type="button" aria-expanded={isExpanded} onClick={() => setExpanded((current) => !current)}><span>Quelle</span><ChevronDownIcon size={15} /></button>
    <div className="agb-source__content"><blockquote><span>Quelle</span>{sourceText}</blockquote></div>
  </div>
}

export default function AgbCheckerPage() {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [isDragging, setDragging] = useState(false)
  const [isAnalyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')

  function selectFile(nextFile) {
    setError('')
    if (!nextFile) return
    if (!(nextFile.type === 'application/pdf' || nextFile.name.toLowerCase().endsWith('.pdf'))) { setError('Bitte wähle eine PDF-Datei aus.'); return }
    if (nextFile.size > MAX_FILE_SIZE) { setError('Die PDF darf maximal 20 MB groß sein.'); return }
    setFile(nextFile); setAnalysis(null)
  }

  function removeFile() { setFile(null); setAnalysis(null); setError(''); if (inputRef.current) inputRef.current.value = '' }
  async function startAnalysis() {
    if (!file || isAnalyzing) return
    setError(''); setAnalyzing(true)
    try { setAnalysis(await analyzeCustomerOrderTerms(file)) } catch (nextError) { setError(errorMessage(nextError)) } finally { setAnalyzing(false) }
  }

  const foundCount = analysis?.results?.filter((item) => item.status === 'found').length || 0
  const unclearCount = analysis?.results?.filter((item) => item.status === 'unclear').length || 0

  return <div className="agb-checker-page">
    <section className={`agb-upload${analysis ? ' agb-upload--compact' : ''}`} aria-label="Kundenauftrag hochladen">
      {!file ? <label className={`agb-dropzone${isDragging ? ' agb-dropzone--dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); selectFile(event.dataTransfer.files?.[0]) }}>
        <DocumentSearchIcon size={35} /><strong>Kundenauftrag hier ablegen</strong><span>PDF auswählen oder per Drag & Drop hochladen</span><small>Maximal 20 MB</small><input ref={inputRef} type="file" accept="application/pdf,.pdf" onChange={(event) => selectFile(event.target.files?.[0])} />
      </label> : <div className="agb-file"><div className="agb-file__icon"><DocumentSearchIcon size={20} /></div><div><strong>{file.name}</strong><span>{formatSize(file.size)}</span></div><div className="agb-file__actions"><button className="button" type="button" onClick={() => { void startAnalysis() }} disabled={isAnalyzing}>{isAnalyzing ? 'Kundenauftrag wird geprüft …' : analysis ? 'Erneut prüfen' : 'Prüfung starten'}</button><button className="agb-file__remove" type="button" onClick={removeFile} disabled={isAnalyzing} aria-label="Datei entfernen" title="Datei entfernen"><CloseIcon size={17} /></button></div></div>}
      {error && <p className="form-error">{error}</p>}
    </section>
    {isAnalyzing && <section className="agb-loading" aria-live="polite"><span className="agb-loading__spinner" aria-hidden="true" />Kundenauftrag wird geprüft …</section>}
    {analysis && !isAnalyzing && <div className="agb-results">
      <section className="agb-summary" aria-label="Zusammenfassung"><span><strong>{foundCount}</strong> Angaben gefunden</span><span><strong>{analysis.findings.length}</strong> Auffälligkeiten</span><span><strong>{unclearCount}</strong> Angaben unklar</span></section>
      {analysis.findings.length > 0 && <section className="agb-findings"><h3>Auffälligkeiten</h3><ul>{analysis.findings.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></section>}
      {sections.map(([category, title]) => <section className="agb-result-section" key={category}><h3>{title}</h3>{analysis.results.filter((item) => item.category === category).map((item) => <article className="agb-result-row" key={item.field}><div className="agb-result-row__main"><h4>{item.field}</h4><p>{item.status === 'not_found' ? 'Nicht gefunden' : item.value || 'Keine eindeutige Angabe'}</p>{item.sourceText && <SourceDisclosure sourceText={item.sourceText} />}</div><div className="agb-result-row__meta"><span className={`agb-status agb-status--${item.status}`}>{statusLabel[item.status]}</span><small className={`agb-confidence agb-confidence--${item.status === 'not_found' ? 'neutral' : item.confidence || 'low'}`}>{confidenceLabel[item.confidence]}</small></div></article>)}</section>)}
      <section className="agb-result-section"><h3>Ansprechpartner</h3>{analysis.contacts?.length ? analysis.contacts.map((contact, index) => <article className="agb-result-row" key={`${contact.name}-${contact.email}-${index}`}><div className="agb-result-row__main"><h4>{contact.name || contact.email}</h4>{contact.name && contact.email && <p>{contact.email}</p>}{contact.department && <p>{contact.department}</p>}{contact.sourceText && <SourceDisclosure sourceText={contact.sourceText} />}</div><div className="agb-result-row__meta"><span className={`agb-status agb-status--${contact.status}`}>{statusLabel[contact.status]}</span><small className={`agb-confidence agb-confidence--${contact.status === 'not_found' ? 'neutral' : contact.confidence || 'low'}`}>{confidenceLabel[contact.confidence]}</small></div></article>) : <article className="agb-result-row agb-result-row--not-found"><div className="agb-result-row__main"><p>{analysis.contactsStatus === 'unclear' ? 'Ansprechpartner unklar' : 'Nicht gefunden'}</p></div><div className="agb-result-row__meta"><span className={`agb-status agb-status--${analysis.contactsStatus || 'not_found'}`}>{statusLabel[analysis.contactsStatus] || 'Nicht gefunden'}</span></div></article>}</section>
      <section className="agb-result-section"><h3>Verbote</h3>{analysis.results.filter((item) => item.category === 'prohibitions').map((item) => <article className="agb-result-row" key={item.field}><div className="agb-result-row__main"><h4>{item.field}</h4><p>{item.status === 'not_found' ? 'Nicht gefunden' : item.value || 'Keine eindeutige Angabe'}</p>{item.sourceText && <SourceDisclosure sourceText={item.sourceText} />}</div><div className="agb-result-row__meta"><span className={`agb-status agb-status--${item.status}`}>{statusLabel[item.status]}</span><small className={`agb-confidence agb-confidence--${item.status === 'not_found' ? 'neutral' : item.confidence || 'low'}`}>{confidenceLabel[item.confidence]}</small></div></article>)}</section>
    </div>}
  </div>
}
