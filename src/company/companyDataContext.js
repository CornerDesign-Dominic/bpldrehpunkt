import { createContext, useContext } from 'react'

export const CompanyDataContext = createContext(null)

export function useCompanyData() {
  const context = useContext(CompanyDataContext)
  if (!context) throw new Error('CompanyDataProvider fehlt.')
  return context
}
