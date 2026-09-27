import { useEffect, useState } from 'react'
import { subscribeCompanyData } from '../lib/companyMasterData.js'
import { DEFAULT_COMPANY_DATA } from '../lib/companyDataModel.js'
import { CompanyDataContext } from './companyDataContext.js'

export function CompanyDataProvider({ children }) {
  const [company, setCompany] = useState(DEFAULT_COMPANY_DATA)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => subscribeCompanyData(
    (value) => { setCompany(value); setLoading(false); setError('') },
    () => { setLoading(false); setError('Die Firmenstammdaten konnten nicht geladen werden.') },
  ), [])

  return <CompanyDataContext.Provider value={{ company, loading, error }}>{children}</CompanyDataContext.Provider>
}
