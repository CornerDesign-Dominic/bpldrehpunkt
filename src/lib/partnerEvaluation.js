export const PARTNER_EVALUATION_DEFAULTS = Object.freeze({
  pallets: Object.freeze({ greenMax: 10, redMin: 60 }),
  creditLimit: Object.freeze({ redMax: 5000, yellowMax: 10000 }),
  ranking: Object.freeze({ redMax: 2.5, greenMin: 4 }),
})

const finiteNumber = (value) => {
  if (value === null || value === undefined || value === '') return null
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

function numberOrDefault(value, fallback) {
  return finiteNumber(value) ?? fallback
}

export function normalizePartnerEvaluationSettings(settings) {
  return {
    pallets: {
      greenMax: numberOrDefault(settings?.pallets?.greenMax, PARTNER_EVALUATION_DEFAULTS.pallets.greenMax),
      redMin: numberOrDefault(settings?.pallets?.redMin ?? settings?.pallets?.yellowMax, PARTNER_EVALUATION_DEFAULTS.pallets.redMin),
    },
    creditLimit: {
      redMax: numberOrDefault(settings?.creditLimit?.redMax, PARTNER_EVALUATION_DEFAULTS.creditLimit.redMax),
      yellowMax: numberOrDefault(settings?.creditLimit?.yellowMax, PARTNER_EVALUATION_DEFAULTS.creditLimit.yellowMax),
    },
    ranking: {
      redMax: numberOrDefault(settings?.ranking?.redMax, PARTNER_EVALUATION_DEFAULTS.ranking.redMax),
      greenMin: numberOrDefault(settings?.ranking?.greenMin ?? settings?.ranking?.yellowMax, PARTNER_EVALUATION_DEFAULTS.ranking.greenMin),
    },
  }
}

export function getPartnerEvaluationStatus(metric, value, settings) {
  const number = finiteNumber(value)
  if (number === null) return 'neutral'
  const rules = normalizePartnerEvaluationSettings(settings)

  if (metric === 'pallets') {
    const balance = Math.abs(number)
    return balance <= rules.pallets.greenMax ? 'green' : balance < rules.pallets.redMin ? 'yellow' : 'red'
  }
  if (metric === 'creditLimit') return number <= rules.creditLimit.redMax ? 'red' : number <= rules.creditLimit.yellowMax ? 'yellow' : 'green'
  if (metric === 'ranking') return number <= rules.ranking.redMax ? 'red' : number < rules.ranking.greenMin ? 'yellow' : 'green'
  return 'neutral'
}

export const PARTNER_EVALUATION_STATUS_LABELS = {
  green: 'Unauffällig',
  yellow: 'Achtung',
  red: 'Kritisch',
  neutral: 'Noch nicht bewertet',
}

export function validatePartnerEvaluationSettings(settings) {
  const requiredValues = [
    settings?.pallets?.greenMax, settings?.pallets?.redMin,
    settings?.creditLimit?.redMax, settings?.creditLimit?.yellowMax,
    settings?.ranking?.redMax, settings?.ranking?.greenMin,
  ]
  if (requiredValues.some((value) => finiteNumber(value) === null)) return { pallets: 'Bitte alle Grenzwerte als gültige Zahlen angeben.', creditLimit: 'Bitte alle Grenzwerte als gültige Zahlen angeben.', ranking: 'Bitte alle Grenzwerte als gültige Zahlen angeben.' }
  const rules = normalizePartnerEvaluationSettings(settings)
  const errors = {}
  if (rules.pallets.greenMax < 0) errors.pallets = 'Die grüne Grenze darf nicht negativ sein.'
  else if (rules.pallets.redMin <= rules.pallets.greenMax) errors.pallets = 'Die rote Grenze muss oberhalb der grünen Grenze liegen.'
  if (rules.creditLimit.redMax < 0 || rules.creditLimit.yellowMax <= rules.creditLimit.redMax) errors.creditLimit = 'Die gelbe Grenze muss oberhalb der roten Grenze liegen.'
  if (rules.ranking.redMax < 0 || rules.ranking.greenMin > 5 || rules.ranking.redMax > 5 || rules.ranking.greenMin <= rules.ranking.redMax) errors.ranking = 'Ranking-Grenzen müssen zwischen 0 und 5 liegen und eindeutig aufeinander folgen.'
  return errors
}
