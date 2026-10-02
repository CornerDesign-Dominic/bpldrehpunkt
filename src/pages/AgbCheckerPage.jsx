import { StaticText } from '../i18n/AutoTranslate.jsx'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/useAuth.js'
import { useLanguage } from '../i18n/useLanguage.js'
import { localeForLanguage } from '../i18n/translations.js'
import { analyzeCustomerOrderTerms } from '../lib/agbChecker.js'
import { loadAgbCheckerHistoryResult, loadMoreAgbCheckerHistory, searchAgbCheckerHistory, subscribeAgbCheckerHistory } from '../lib/agbCheckerHistory.js'
import { agbCheckerTestData } from '../lib/agbCheckerTestData.js'
import { CloseIcon, DocumentSearchIcon } from '../components/icons.jsx'
import '../styles/agbChecker.css'

const MAX_FILE_SIZE = 20 * 1024 * 1024
const sections = [
  ['customer', 'agb.customer'], ['billing', 'agb.billing'], ['pallets', 'agb.pallets'], ['costs', 'agb.costs'],
]
const statusKeys = { found: 'agb.found', not_found: 'agb.notFound', unclear: 'agb.unclear' }

function formatSize(size, language) { return `${(size / (1024 * 1024)).toLocaleString(localeForLanguage(language), { maximumFractionDigits: 1 })} MB` }
function errorMessage(error, language, t) { return language === 'de' ? error?.message?.replace(/^.*?:\s*/, '') || t('agb.startError') : t('agb.startError') }
function historyDate(timestamp, language) {
  const date = timestamp?.toDate?.()
  return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat(localeForLanguage(language), { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Berlin' }).format(date) : '-'
}
function historyLocation(identity) { return [identity?.country, identity?.postalCode, identity?.city].map((value) => value?.trim() || '-').join(' · ') }

function SourceDisclosure({ sourceText }) {
  const { t } = useLanguage()
  const [isExpanded, setExpanded] = useState(false)
  return <div className={`agb-source${isExpanded ? ' agb-source--expanded' : ''}`}>
    <button className="agb-source__toggle" type="button" aria-expanded={isExpanded} onClick={() => setExpanded((current) => !current)}>{t('agb.source')}</button>
    <div className="agb-source__content"><blockquote>{sourceText}</blockquote></div>
  </div>
}

function ResultStatus({ status, confidence }) {
  const { t } = useLanguage()
  const isLimited = status === 'found' && confidence !== 'high'
  const tone = isLimited ? 'unclear' : status
  return <span className={`agb-status agb-status--${tone}`}>{t(isLimited ? 'agb.limited' : statusKeys[status] || 'agb.notFound')}</span>
}

export default function AgbCheckerPage() {
  const { profile } = useAuth()
  const { language, t } = useLanguage()
  const inputRef = useRef(null)
  const openRequestRef = useRef(0)
  const historyCursorRef = useRef(null)
  const historyPagesLoadedRef = useRef(false)
  const [file, setFile] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [isTestMode, setTestMode] = useState(false)
  const [isDragging, setDragging] = useState(false)
  const [isAnalyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState([])
  const [historyStatus, setHistoryStatus] = useState('loading')
  const [historySearch, setHistorySearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchStatus, setSearchStatus] = useState('idle')
  const [historyHasMore, setHistoryHasMore] = useState(false)
  const [isLoadingMore, setLoadingMore] = useState(false)
  const [historyPageError, setHistoryPageError] = useState(false)
  const [selectedHistoryId, setSelectedHistoryId] = useState(null)
  const [isOpeningHistory, setOpeningHistory] = useState(false)

  useEffect(() => subscribeAgbCheckerHistory(
    (entries, cursor, hasMore) => {
      if (historyPagesLoadedRef.current) {
        setHistory((current) => {
          const firstPageIds = new Set(entries.map((entry) => entry.id))
          return [...entries, ...current.filter((entry) => !firstPageIds.has(entry.id))]
        })
      } else {
        historyCursorRef.current = cursor
        setHistory(entries)
        setHistoryHasMore(hasMore)
      }
      setHistoryStatus('ready')
    },
    () => setHistoryStatus('error'),
  ), [])

  useEffect(() => {
    if (!historySearch.trim()) return undefined
    let active = true
    const timeout = setTimeout(() => {
      void searchAgbCheckerHistory(historySearch)
        .then((entries) => { if (active) { setSearchResults(entries); setSearchStatus('ready') } })
        .catch(() => { if (active) setSearchStatus('error') })
    }, 250)
    return () => { active = false; clearTimeout(timeout) }
  }, [historySearch])

  async function loadMoreHistory() {
    if (isLoadingMore || !historyHasMore || !historyCursorRef.current) return
    historyPagesLoadedRef.current = true
    setLoadingMore(true); setHistoryPageError(false)
    try {
      const page = await loadMoreAgbCheckerHistory(historyCursorRef.current)
      historyCursorRef.current = page.cursor
      setHistory((current) => {
        const knownIds = new Set(current.map((entry) => entry.id))
        return [...current, ...page.entries.filter((entry) => !knownIds.has(entry.id))]
      })
      setHistoryHasMore(page.hasMore)
    } catch { setHistoryPageError(true) } finally { setLoadingMore(false) }
  }

  function selectFile(nextFile) {
    setError('')
    if (!nextFile) return
    if (!(nextFile.type === 'application/pdf' || nextFile.name.toLowerCase().endsWith('.pdf'))) { setError(t('agb.pdfOnly')); return }
    if (nextFile.size > MAX_FILE_SIZE) { setError(t('agb.tooLarge')); return }
    openRequestRef.current += 1
    setOpeningHistory(false)
    setFile(nextFile); setAnalysis(null); setTestMode(false); setSelectedHistoryId(null)
  }

  function removeFile() { openRequestRef.current += 1; setOpeningHistory(false); setFile(null); setAnalysis(null); setTestMode(false); setSelectedHistoryId(null); setError(''); if (inputRef.current) inputRef.current.value = '' }
  async function startAnalysis() {
    if (!file || isAnalyzing) return
    setError(''); setTestMode(false); setAnalyzing(true)
    try {
      const nextAnalysis = await analyzeCustomerOrderTerms(file)
      setAnalysis(nextAnalysis)
      setSelectedHistoryId(nextAnalysis.historyId || null)
    } catch (nextError) { setError(errorMessage(nextError, language, t)) } finally { setAnalyzing(false) }
  }
  function loadTestData() {
    if (profile?.role !== 'superadmin') return
    openRequestRef.current += 1
    setOpeningHistory(false)
    setError(''); setFile(null); setAnalysis(agbCheckerTestData); setTestMode(true); setSelectedHistoryId(null)
    if (inputRef.current) inputRef.current.value = ''
  }
  function clearTestData() { openRequestRef.current += 1; setOpeningHistory(false); setAnalysis(null); setTestMode(false); setSelectedHistoryId(null) }
  async function openHistory(entry) {
    const requestId = ++openRequestRef.current
    setFile(null); setAnalysis(null); setTestMode(false); setSelectedHistoryId(entry.id); setError(''); setOpeningHistory(true)
    if (inputRef.current) inputRef.current.value = ''
    try {
      const savedAnalysis = await loadAgbCheckerHistoryResult(entry.id)
      if (requestId === openRequestRef.current) setAnalysis(savedAnalysis)
    } catch {
      if (requestId === openRequestRef.current) { setSelectedHistoryId(null); setError(t('agb.historyResultError')) }
    } finally {
      if (requestId === openRequestRef.current) setOpeningHistory(false)
    }
  }

  const foundCount = analysis?.results?.filter((item) => item.status === 'found').length || 0
  const unclearCount = analysis?.results?.filter((item) => item.status === 'unclear').length || 0
  const isSearchingHistory = Boolean(historySearch.trim())
  const visibleHistory = isSearchingHistory ? searchResults : history
  const visibleHistoryStatus = isSearchingHistory ? searchStatus : historyStatus

  return <div className="agb-checker-page">
    <div className="agb-checker-main">
    <section className={`agb-upload${analysis ? ' agb-upload--compact' : ''}`} aria-label={t('agb.upload')}>
      {!file ? <label className={`agb-dropzone${isDragging ? ' agb-dropzone--dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); selectFile(event.dataTransfer.files?.[0]) }}>
        <DocumentSearchIcon size={35} /><strong>{t('agb.drop')}</strong><span>{t('agb.choosePdf')}</span><small>{t('agb.maxSize')}</small><input ref={inputRef} type="file" accept="application/pdf,.pdf" onChange={(event) => selectFile(event.target.files?.[0])} />
      </label> : <div className="agb-file"><div className="agb-file__icon"><DocumentSearchIcon size={20} /></div><div><strong>{file.name}</strong><span>{formatSize(file.size, language)}</span></div><div className="agb-file__actions"><button className="button" type="button" onClick={() => { void startAnalysis() }} disabled={isAnalyzing}>{t(isAnalyzing ? 'agb.analyzing' : analysis ? 'agb.retry' : 'agb.start')}</button><button className="agb-file__remove" type="button" onClick={removeFile} disabled={isAnalyzing} aria-label={t('agb.removeFile')} title={t('agb.removeFile')}><CloseIcon size={17} /></button></div></div>}
      {profile?.role === 'superadmin' && <div className="agb-test-actions">{isTestMode && <span className="agb-test-mode">{t('agb.testData')}</span>}<button className="button button--secondary" type="button" onClick={loadTestData} disabled={isAnalyzing || isOpeningHistory}>{t('agb.loadTestData')}</button>{isTestMode && <button className="agb-test-clear" type="button" onClick={clearTestData}>{t('agb.clearTestData')}</button>}</div>}
      {error && <p className="form-error">{<StaticText source={error} />}</p>}
    </section>
    {isAnalyzing && <section className="agb-loading" aria-live="polite"><span className="agb-loading__spinner" aria-hidden="true" />{t('agb.analyzing')}</section>}
    {isOpeningHistory && <section className="agb-loading" aria-live="polite"><span className="agb-loading__spinner" aria-hidden="true" />{t('agb.openingHistory')}</section>}
    {analysis && !isAnalyzing && <div className="agb-results">
      <section className="agb-summary" aria-label={t('agb.summary')}><span><strong>{foundCount}</strong> {t('agb.foundDetails')}</span><span><strong>{analysis.findings.length}</strong> {t('agb.findings')}</span><span><strong>{unclearCount}</strong> {t('agb.unclearDetails')}</span></section>
      {analysis.findings.length > 0 && <section className="agb-findings"><h3>{t('agb.findings')}</h3><ul>{analysis.findings.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></section>}
      {sections.map(([category, title]) => <section className="agb-result-section" key={category}><h3>{t(title)}</h3>{analysis.results.filter((item) => item.category === category).map((item) => <article className="agb-result-row" key={item.field}><div className="agb-result-row__main"><h4>{item.field}</h4><p>{item.status === 'not_found' ? t('agb.notFound') : item.value || t('agb.noClearDetail')}</p>{item.sourceText && <SourceDisclosure sourceText={item.sourceText} />}</div><div className="agb-result-row__meta"><ResultStatus status={item.status} confidence={item.confidence} /></div></article>)}</section>)}
      <section className="agb-result-section"><h3>{t('agb.contacts')}</h3>{analysis.contacts?.length ? analysis.contacts.map((contact, index) => <article className="agb-result-row" key={`${contact.name}-${contact.email}-${index}`}><div className="agb-result-row__main"><h4>{contact.name || contact.email}</h4>{contact.name && contact.email && <p>{contact.email}</p>}{contact.department && <p>{contact.department}</p>}{contact.sourceText && <SourceDisclosure sourceText={contact.sourceText} />}</div><div className="agb-result-row__meta"><ResultStatus status={contact.status} confidence={contact.confidence} /></div></article>) : <article className="agb-result-row agb-result-row--not-found"><div className="agb-result-row__main"><p>{t(analysis.contactsStatus === 'unclear' ? 'agb.contactsUnclear' : 'agb.notFound')}</p></div><div className="agb-result-row__meta"><ResultStatus status={analysis.contactsStatus || 'not_found'} /></div></article>}</section>
      <section className="agb-result-section"><h3>{t('agb.prohibitions')}</h3>{analysis.results.filter((item) => item.category === 'prohibitions').map((item) => <article className="agb-result-row" key={item.field}><div className="agb-result-row__main"><h4>{item.field}</h4><p>{item.status === 'not_found' ? t('agb.notFound') : item.value || t('agb.noClearDetail')}</p>{item.sourceText && <SourceDisclosure sourceText={item.sourceText} />}</div><div className="agb-result-row__meta"><ResultStatus status={item.status} confidence={item.confidence} /></div></article>)}</section>
    </div>}
    </div>
    <aside className="agb-history" aria-label={t('agb.history')}>
      <h2>{t('agb.history')}</h2>
      <input className="agb-history__search" type="search" value={historySearch} onChange={(event) => { setHistorySearch(event.target.value); setSearchStatus('loading') }} placeholder={t('agb.searchCustomer')} aria-label={t('agb.searchCustomer')} />
      {visibleHistoryStatus === 'loading' && <div className="agb-history__skeleton" role="status" aria-label={t('agb.historyLoading')}>{[0, 1, 2].map((item) => <div className="agb-history__skeleton-card" key={item}><span /><span /><span /></div>)}</div>}
      {visibleHistoryStatus === 'error' && <p className="agb-history__message form-error">{t('agb.historyError')}</p>}
      {visibleHistoryStatus === 'ready' && visibleHistory.length === 0 && <p className="agb-history__message">{t(isSearchingHistory ? 'agb.historyNoMatches' : 'agb.historyEmpty')}</p>}
      {visibleHistoryStatus === 'ready' && <div className="agb-history__list">
        {visibleHistory.map((entry) => {
          const identity = entry.customerIdentity || entry.analysis?.customerIdentity
          const name = identity?.name?.trim() || t('agb.unknownCustomer')
          const location = historyLocation(identity)
          const date = historyDate(entry.createdAt, language)
          return <button className={`agb-history__card${selectedHistoryId === entry.id ? ' agb-history__card--selected' : ''}`} type="button" key={entry.id} onClick={() => { void openHistory(entry) }} disabled={isAnalyzing || isOpeningHistory} aria-current={selectedHistoryId === entry.id ? 'true' : undefined}>
            <span className="agb-history__name" title={name}>{name}</span>
            <span className="agb-history__location" title={location}>{location}</span>
            <span className="agb-history__date" title={date}>{date}</span>
          </button>
        })}
        {!isSearchingHistory && historyHasMore && <button className="agb-history__more" type="button" onClick={() => { void loadMoreHistory() }} disabled={isLoadingMore}>{t(isLoadingMore ? 'agb.historyLoading' : 'agb.historyMore')}</button>}
        {!isSearchingHistory && historyPageError && <p className="agb-history__message form-error">{t('agb.historyMoreError')}</p>}
      </div>}
    </aside>
  </div>
}
