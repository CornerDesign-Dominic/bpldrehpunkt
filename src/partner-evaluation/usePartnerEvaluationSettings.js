import { useContext } from 'react'
import { PartnerEvaluationSettingsContext } from './partnerEvaluationSettingsContext.js'

export function usePartnerEvaluationSettings() {
  const context = useContext(PartnerEvaluationSettingsContext)
  if (!context) throw new Error('usePartnerEvaluationSettings muss innerhalb des PartnerEvaluationSettingsProvider verwendet werden.')
  return context
}
