import { TRANSPORT_RATING_CRITERIA } from '../../shared/transportOrderRatings.js'

export function transportRatingSummary(ratings, role) {
  const selected = ratings.filter((rating) => rating.partnerRole === role)
  const averageValues = selected.map((rating) => rating.averageScore).filter((value) => typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 5)
  return {
    count: selected.length,
    averageScore: averageValues.length ? averageValues.reduce((sum, value) => sum + value, 0) / averageValues.length : null,
    criteria: TRANSPORT_RATING_CRITERIA[role].map(({ key, label }) => {
      const values = selected.map((rating) => rating.scores?.[key]).filter((value) => Number.isInteger(value) && value >= 1 && value <= 5)
      return { key, label, count: values.length, averageScore: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null }
    }),
  }
}

export function formatTransportRatingScore(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(value)
    : '—'
}
