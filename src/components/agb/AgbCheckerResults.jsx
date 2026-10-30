import { useState } from 'react'
import { useLanguage } from '../../i18n/useLanguage.js'
import '../../styles/agbChecker.css'

const sections = [['customer', 'agb.customer'], ['billing', 'agb.billing'], ['pallets', 'agb.pallets'], ['costs', 'agb.costs']]
const statusKeys = { found: 'agb.found', not_found: 'agb.notFound', unclear: 'agb.unclear' }

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

export default function AgbCheckerResults({ analysis }) {
  const { t } = useLanguage()
  const foundCount = analysis.results.filter(item => item.status === 'found').length
  const unclearCount = analysis.results.filter(item => item.status === 'unclear').length
  return (
    <div className="agb-results">
      {analysis.ocr?.length > 0 && <section className="agb-summary"><span>{analysis.ocr.map(file => `${file.name} · OCR · ${file.pages.join(", ")}`).join("; ")}</span></section>}
      <section className="agb-summary" aria-label={t('agb.summary')}><span><strong>{foundCount}</strong> {t('agb.foundDetails')}</span><span><strong>{analysis.findings.length}</strong> {t('agb.findings')}</span><span><strong>{unclearCount}</strong> {t('agb.unclearDetails')}</span></section>
      {analysis.findings.length > 0 && <section className="agb-findings"><h3>{t('agb.findings')}</h3><ul>{analysis.findings.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></section>}
      {sections.map(([category, title]) => <section className="agb-result-section" key={category}><h3>{t(title)}</h3>{analysis.results.filter((item) => item.category === category).map((item) => <article className="agb-result-row" key={item.field}><div className="agb-result-row__main"><h4>{item.field}</h4><p>{item.status === 'not_found' ? t('agb.notFound') : item.value || t('agb.noClearDetail')}</p>{item.sourceText && <SourceDisclosure sourceText={item.sourceText} />}</div><div className="agb-result-row__meta"><ResultStatus status={item.status} confidence={item.confidence} /></div></article>)}</section>)}
      <section className="agb-result-section"><h3>{t('agb.contacts')}</h3>{analysis.contacts?.length ? analysis.contacts.map((contact, index) => <article className="agb-result-row" key={`${contact.name}-${contact.email}-${index}`}><div className="agb-result-row__main"><h4>{contact.name || contact.email}</h4>{contact.name && contact.email && <p>{contact.email}</p>}{contact.department && <p>{contact.department}</p>}{contact.sourceText && <SourceDisclosure sourceText={contact.sourceText} />}</div><div className="agb-result-row__meta"><ResultStatus status={contact.status} confidence={contact.confidence} /></div></article>) : <article className="agb-result-row agb-result-row--not-found"><div className="agb-result-row__main"><p>{t(analysis.contactsStatus === 'unclear' ? 'agb.contactsUnclear' : 'agb.notFound')}</p></div><div className="agb-result-row__meta"><ResultStatus status={analysis.contactsStatus || 'not_found'} /></div></article>}</section>
      <section className="agb-result-section"><h3>{t('agb.prohibitions')}</h3>{analysis.results.filter((item) => item.category === 'prohibitions').map((item) => <article className="agb-result-row" key={item.field}><div className="agb-result-row__main"><h4>{item.field}</h4><p>{item.status === 'not_found' ? t('agb.notFound') : item.value || t('agb.noClearDetail')}</p>{item.sourceText && <SourceDisclosure sourceText={item.sourceText} />}</div><div className="agb-result-row__meta"><ResultStatus status={item.status} confidence={item.confidence} /></div></article>)}</section>
    </div>
  )
}
