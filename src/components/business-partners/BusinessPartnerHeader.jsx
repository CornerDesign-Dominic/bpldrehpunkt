import { Link } from 'react-router-dom'
import { ChevronIcon } from '../icons.jsx'
import { getBusinessPartnerType } from '../../lib/businessPartners.js'
import { formatTransportRatingScore } from '../../lib/transportOrderRatingPresentation.js'
import { formatPalletNumber } from '../pallets/palletFormatters.js'
import { getPartnerEvaluationStatus, PARTNER_EVALUATION_STATUS_LABELS } from '../../lib/partnerEvaluation.js'
import { usePartnerEvaluationSettings } from '../../partner-evaluation/usePartnerEvaluationSettings.js'
import { crmPartnerPath, palletAccountPath } from '../../lib/businessPartnerLinks.js'

const CREDIT_LIMIT_STATUS_LABELS = { green: 'Hoch', yellow: 'Mittel', red: 'Gering', neutral: 'Noch nicht bewertet' }

function formatCreditLimit(value) {
  return value === null || value === undefined ? '—' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(value)
}

function formatRankingValue(rating) {
  return rating?.averageScore === null || rating?.averageScore === undefined ? '-' : `${formatTransportRatingScore(rating.averageScore)} / 5`
}

function formatPartnerSince(value) {
  const text = String(value).trim()
  const germanDate = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/)
  if (germanDate) return `${germanDate[1].padStart(2, '0')}.${germanDate[2].padStart(2, '0')}.${germanDate[3]}`

  const isoDate = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoDate) return `${isoDate[3]}.${isoDate[2]}.${isoDate[1]}`

  return text
}

function PartnerHeaderTile({ ariaLabel, children, title, to, tone }) {
  const content = <><span className="partner-header__tile-heading"><span className="partner-header__tile-label">{title}</span>{to && <span className="partner-header__tile-chevron" aria-hidden="true"><ChevronIcon size={18} /></span>}</span>{children}</>
  return to
    ? <Link className={`partner-header__tile partner-header__tile--${tone} partner-header__tile--link`} to={to} aria-label={ariaLabel}>{content}</Link>
    : <div className={`partner-header__tile partner-header__tile--${tone}`}>{content}</div>
}

export default function BusinessPartnerHeader({ account, canViewCrm, canViewPallets, partner, partnerId, ratings }) {
  const { settings } = usePartnerEvaluationSettings()
  const customerRating = ratings?.customer
  const carrierRating = ratings?.carrier
  const palletStatus = getPartnerEvaluationStatus('pallets', account?.balance, settings)
  const creditStatus = getPartnerEvaluationStatus('creditLimit', partner.creditLimit, settings)

  return <section className="partner-header" aria-labelledby="partner-header-title">
    <div className="partner-header__identity">
      <h1 id="partner-header-title">{partner.companyName || 'Geschäftspartner'}</h1>
      {partner.dycosCreatedAt && <p className="partner-header__since">Partner seit (DyCoS): <strong>{formatPartnerSince(partner.dycosCreatedAt)}</strong></p>}
      <p>{getBusinessPartnerType(partner)}</p>
      <p className="partner-header__numbers">Debitor: <strong>{partner.debtorNumber || '—'}</strong><span aria-hidden="true">·</span>Kreditor: <strong>{partner.creditorNumber || '—'}</strong></p>
    </div>

    <div className="partner-header__tiles">
      <PartnerHeaderTile ariaLabel="Palettenkonto öffnen" title="Paletten" tone="pallets" to={canViewPallets ? palletAccountPath(partnerId) : undefined}>
        <strong className="partner-header__tile-value" data-status={palletStatus}>{account ? formatPalletNumber(account.balance, true) : '—'}</strong><span className="partner-evaluation-label" data-status={palletStatus}>{PARTNER_EVALUATION_STATUS_LABELS[palletStatus]}</span>
      </PartnerHeaderTile>

      <PartnerHeaderTile ariaLabel="CRM des Geschäftspartners öffnen" title="Ranking" tone="ranking" to={canViewCrm ? crmPartnerPath(partnerId) : undefined}>
        <span className="partner-header__rating"><strong data-status={getPartnerEvaluationStatus('ranking', customerRating?.averageScore, settings)}>{formatRankingValue(customerRating)}</strong><span className="partner-header__rating-label">KU</span></span>
        <span className="partner-header__rating"><strong data-status={getPartnerEvaluationStatus('ranking', carrierRating?.averageScore, settings)}>{formatRankingValue(carrierRating)}</strong><span className="partner-header__rating-label">UTN</span></span>
      </PartnerHeaderTile>

      <PartnerHeaderTile ariaLabel="CRM und Kreditlimit öffnen" title="Kreditlimit" to={canViewCrm ? crmPartnerPath(partnerId) : undefined} tone="credit-limit">
        <strong className="partner-header__tile-value" data-status={creditStatus}>{formatCreditLimit(partner.creditLimit)}</strong><span className="partner-evaluation-label" data-status={creditStatus}>{CREDIT_LIMIT_STATUS_LABELS[creditStatus]}</span>
      </PartnerHeaderTile>
    </div>
  </section>
}
