import { StaticText, TranslatedProps } from '../../i18n/AutoTranslate.jsx'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePermissions } from '../../auth/usePermissions.js'
import { listPartnerTransportOrderRatings } from '../../lib/transportOrderRatings.js'
import { formatTransportRatingScore, transportRatingSummary } from '../../lib/transportOrderRatingPresentation.js'
import { transportOrderPath } from '../../lib/transportOrderPresentation.js'
import { getPartnerEvaluationStatus } from '../../lib/partnerEvaluation.js'
import { usePartnerEvaluationSettings } from '../../partner-evaluation/usePartnerEvaluationSettings.js'
import { TRANSPORT_RATING_CRITERIA } from '../../../shared/transportOrderRatings.js'

const roles = [{ key: 'customer', label: 'Als Kunde' }, { key: 'carrier', label: 'Als Unternehmer' }]
const ratingsPerPage = 6

function formatDate(milliseconds) {
  return milliseconds ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(new Date(milliseconds)) : '—'
}

function RatingEntry({ rating, role, canViewTransportOrders }) {
  const orderLabel = `TA ${rating.transportOrderNumber || '—'}`
  return <li className="crm-transport-rating__entry">
    <div className="crm-transport-rating__entry-heading"><div className="crm-transport-rating__entry-meta"><span className="crm-transport-rating__role-tag">{<StaticText source={role === 'customer' ? 'Kunde' : 'Unternehmer'} />}</span>{canViewTransportOrders && rating.transportOrderId ? <Link to={transportOrderPath(rating.transportOrderId)}>{orderLabel}</Link> : <strong>{orderLabel}</strong>}<time dateTime={rating.createdAtMs ? new Date(rating.createdAtMs).toISOString() : undefined}>{formatDate(rating.createdAtMs)}</time></div><strong className="crm-transport-rating__entry-score">{formatTransportRatingScore(rating.averageScore)} <span>/ 5 ★</span></strong></div>
    <dl className="crm-transport-rating__scores">{TRANSPORT_RATING_CRITERIA[role].filter(({ key }) => Number.isInteger(rating.scores?.[key])).map(({ key, label }) => <div key={key}><dt>{label}</dt><dd>{rating.scores[key]} ★</dd></div>)}</dl>
    {rating.comment && <p className="crm-transport-rating__comment">{rating.comment}</p>}
  </li>
}

export default function CrmRatingPanel({ partnerId }) {
  const { canView } = usePermissions()
  const { settings } = usePartnerEvaluationSettings()
  const [result, setResult] = useState({ partnerId: '', ratings: [], error: '' })
  const [pagination, setPagination] = useState({ partnerId, page: 0 })
  useEffect(() => {
    let current = true
    listPartnerTransportOrderRatings(partnerId)
      .then((ratings) => { if (current) setResult({ partnerId, ratings, error: '' }) })
      .catch(() => { if (current) setResult({ partnerId, ratings: [], error: 'Die Transportbewertungen konnten nicht geladen werden.' }) })
    return () => { current = false }
  }, [partnerId])
  const loading = result.partnerId !== partnerId
  const ratings = loading ? [] : result.ratings
  const pageCount = Math.max(1, Math.ceil(ratings.length / ratingsPerPage))
  const page = Math.min(pagination.partnerId === partnerId ? pagination.page : 0, pageCount - 1)
  const pageStart = page * ratingsPerPage
  const visibleRatings = ratings.slice(pageStart, pageStart + ratingsPerPage)
  const canViewTransportOrders = canView('transportOrders')

  return <TranslatedProps sources={{"aria-label":"Transportbewertungen"}}><section className="crm-ratings" aria-label="Transportbewertungen">
    <div className="crm-ratings__heading"><div><h3><StaticText source={"Transportbewertungen"} /></h3><p><StaticText source={"Bewertungen zu konkreten Transportaufträgen"} /></p></div>{!loading && !result.error && <span>{ratings.length} {<StaticText source={ratings.length === 1 ? 'Bewertung' : 'Bewertungen'} />}</span>}</div>
    {loading && <p className="page-state"><StaticText source={"Bewertungen werden geladen …"} /></p>}
    {!loading && result.error && <p className="form-error" role="alert">{result.error}</p>}
    {!loading && !result.error && <>
      <div className="crm-ratings__roles crm-ratings__roles--2">{roles.map(({ key: role, label }) => {
        const summary = transportRatingSummary(ratings, role)
        return <section className="crm-rating-role crm-transport-rating" key={role} aria-label={label}>
          <div className="crm-rating-role__heading"><div><h4>{label}</h4><span>{summary.count} {<StaticText source={summary.count === 1 ? 'Bewertung' : 'Bewertungen'} />}</span></div>{summary.averageScore !== null && <strong className="crm-rating-role__score partner-evaluation-value" data-status={getPartnerEvaluationStatus('ranking', summary.averageScore, settings)}>{formatTransportRatingScore(summary.averageScore)} <small>/ 5 ★</small></strong>}</div>
          {summary.count > 0 && <dl className="crm-transport-rating__summary">{summary.criteria.map(({ key, label: criterion, averageScore, count }) => <div key={key}><dt>{criterion}</dt><dd>{averageScore === null ? '—' : `${formatTransportRatingScore(averageScore)} ★`}<small>{count} {count === 1 ? 'Wertung' : 'Wertungen'}</small></dd></div>)}</dl>}
        </section>
      })}</div>
      {ratings.length > 0 && <details className="crm-transport-rating__history" key={partnerId}>
        <summary className="crm-transport-rating__history-heading"><span><StaticText source={"Einzelbewertungen"} /> <small>({ratings.length})</small></span><span className="crm-transport-rating__history-toggle"><span className="crm-transport-rating__show-label"><StaticText source={"Anzeigen"} /></span><span className="crm-transport-rating__hide-label"><StaticText source={"Schließen"} /></span><span className="crm-transport-rating__chevron" aria-hidden="true" /></span></summary>
        <div className="crm-transport-rating__history-content">
          <p className="crm-transport-rating__history-order"><StaticText source={"Neueste zuerst"} /></p>
          <ol className="crm-transport-rating__list" start={pageStart + 1}>{visibleRatings.map((rating) => <RatingEntry key={rating.id} rating={rating} role={rating.partnerRole} canViewTransportOrders={canViewTransportOrders} />)}</ol>
          {pageCount > 1 && <TranslatedProps sources={{"aria-label":"Seiten der Einzelbewertungen"}}><nav className="crm-transport-rating__pagination" aria-label="Seiten der Einzelbewertungen"><span>{pageStart + 1}–{Math.min(pageStart + ratingsPerPage, ratings.length)} <StaticText source={"von"} /> {ratings.length}</span><div><button type="button" disabled={page === 0} onClick={() => setPagination({ partnerId, page: page - 1 })}><StaticText source={"Zurück"} /></button><span aria-live="polite"><StaticText source={"Seite"} /> {page + 1} <StaticText source={"von"} /> {pageCount}</span><button type="button" disabled={page === pageCount - 1} onClick={() => setPagination({ partnerId, page: page + 1 })}><StaticText source={"Weiter"} /></button></div></nav></TranslatedProps>}
        </div>
      </details>}
    </>}
  </section></TranslatedProps>
}
