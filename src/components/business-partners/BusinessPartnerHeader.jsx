import { Link } from 'react-router-dom'
import { ChevronIcon } from '../icons.jsx'
import { getBusinessPartnerType } from '../../lib/businessPartners.js'
import { getCurrentCrmRatingPresentation } from '../../lib/crmRatings.js'
import { formatPalletNumber } from '../pallets/palletFormatters.js'
import { getPartnerEvaluationStatus, PARTNER_EVALUATION_STATUS_LABELS } from '../../lib/partnerEvaluation.js'
import { usePartnerEvaluationSettings } from '../../partner-evaluation/usePartnerEvaluationSettings.js'

function formatCreditLimit(value) {
  return value === null || value === undefined ? '—' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(value)
}

function PartnerHeaderTile({ ariaLabel, children, title, to, tone }) {
  const content = <><span className="partner-header__tile-heading"><span className="partner-header__tile-label">{title}</span>{to && <span className="partner-header__tile-chevron" aria-hidden="true"><ChevronIcon size={18} /></span>}</span>{children}</>
  return to
    ? <Link className={`partner-header__tile partner-header__tile--${tone} partner-header__tile--link`} to={to} aria-label={ariaLabel}>{content}</Link>
    : <div className={`partner-header__tile partner-header__tile--${tone}`}>{content}</div>
}

export default function BusinessPartnerHeader({ account, canViewCrm, canViewPallets, partner, partnerId, ratings }) {
  const { settings } = usePartnerEvaluationSettings()
  const ratingItems = getCurrentCrmRatingPresentation(partner, ratings)
  const ratingsByRole = Object.fromEntries(ratingItems.map((rating) => [rating.role, rating]))
  const customerRating = ratingsByRole.customer
  const carrierRating = ratingsByRole.carrier
  const palletStatus = getPartnerEvaluationStatus('pallets', account?.balance, settings)
  const creditStatus = getPartnerEvaluationStatus('creditLimit', partner.creditLimit, settings)

  return <section className="partner-header" aria-labelledby="partner-header-title">
    <div className="partner-header__identity">
      <h1 id="partner-header-title">{partner.companyName || 'Geschäftspartner'}</h1>
      <p>{getBusinessPartnerType(partner)}</p>
      <p className="partner-header__numbers">Debitor: <strong>{partner.debtorNumber || '—'}</strong><span aria-hidden="true">·</span>Kreditor: <strong>{partner.creditorNumber || '—'}</strong></p>
    </div>

    <div className="partner-header__tiles">
      <PartnerHeaderTile ariaLabel="Palettenkonto öffnen" title="Paletten" tone="pallets" to={canViewPallets ? `/paletten/${partnerId}` : undefined}>
        <strong className="partner-header__tile-value" data-status={palletStatus}>{account ? formatPalletNumber(account.balance, true) : '—'}</strong><span className="partner-evaluation-label" data-status={palletStatus}>{PARTNER_EVALUATION_STATUS_LABELS[palletStatus]}</span>
      </PartnerHeaderTile>

      <PartnerHeaderTile ariaLabel="CRM des Geschäftspartners öffnen" title="Ranking" tone="ranking" to={canViewCrm ? `/crm/${partnerId}` : undefined}>
        <span className="partner-header__rating"><strong data-status={getPartnerEvaluationStatus('ranking', customerRating?.score, settings)}>{customerRating?.value ?? 'Noch nicht bewertet'}</strong><span className="partner-header__rating-label">KU</span></span>
        <span className="partner-header__rating"><strong data-status={getPartnerEvaluationStatus('ranking', carrierRating?.score, settings)}>{carrierRating?.value ?? 'Noch nicht bewertet'}</strong><span className="partner-header__rating-label">UTN</span></span>
      </PartnerHeaderTile>

      <PartnerHeaderTile ariaLabel="CRM und Kreditlimit öffnen" title="Kreditlimit" tone="credit-limit" to={canViewCrm ? `/crm/${partnerId}` : undefined}>
        <strong className="partner-header__tile-value" data-status={creditStatus}>{formatCreditLimit(partner.creditLimit)}</strong><span className="partner-evaluation-label" data-status={creditStatus}>{PARTNER_EVALUATION_STATUS_LABELS[creditStatus]}</span>
      </PartnerHeaderTile>
    </div>
  </section>
}
