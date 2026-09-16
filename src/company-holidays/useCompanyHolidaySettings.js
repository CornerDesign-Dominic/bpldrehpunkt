import { useContext } from 'react'
import { CompanyHolidaySettingsContext } from './companyHolidaySettingsContext.js'

export function useCompanyHolidaySettings() {
  const context = useContext(CompanyHolidaySettingsContext)
  if (!context) throw new Error('useCompanyHolidaySettings muss innerhalb des CompanyHolidaySettingsProvider verwendet werden.')
  return context
}
