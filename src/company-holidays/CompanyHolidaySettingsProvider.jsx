import { useEffect, useMemo, useState } from 'react'
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { useAuth } from '../auth/useAuth.js'
import { companyHolidayEntries, DEFAULT_COMPANY_HOLIDAY_REGION, normalizeCompanyHolidayRegion } from '../lib/companyHolidays.js'
import { db, functions } from '../lib/firebase.js'
import { PUBLIC_HOLIDAYS_COLLECTION } from '../lib/holidayData.js'
import { CompanyHolidaySettingsContext } from './companyHolidaySettingsContext.js'

const settingsRef = doc(db, 'appSettings', 'holidayCalendar')

export function CompanyHolidaySettingsProvider({ children }) {
  const { user } = useAuth()
  const [region, setRegion] = useState(DEFAULT_COMPANY_HOLIDAY_REGION)
  const [holidayRecords, setHolidayRecords] = useState([])

  useEffect(() => {
    if (!user) return undefined
    return onSnapshot(settingsRef, (snapshot) => setRegion(normalizeCompanyHolidayRegion(snapshot.exists() ? snapshot.data()?.companyHolidayRegion : null)), () => setRegion(DEFAULT_COMPANY_HOLIDAY_REGION))
  }, [user])

  useEffect(() => {
    if (!user) return undefined
    return onSnapshot(query(collection(db, PUBLIC_HOLIDAYS_COLLECTION), where('countryCode', '==', 'DE')), (snapshot) => setHolidayRecords(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))), () => setHolidayRecords([]))
  }, [user])

  const value = useMemo(() => ({
    region,
    calendarEntries: companyHolidayEntries(holidayRecords, region),
    async saveRegion(nextRegion) {
      const normalized = normalizeCompanyHolidayRegion(nextRegion)
      const response = await httpsCallable(functions, 'updateCompanyHolidayRegion')({ companyHolidayRegion: normalized })
      const saved = normalizeCompanyHolidayRegion(response.data?.companyHolidayRegion ?? normalized)
      setRegion(saved)
      return saved
    },
  }), [holidayRecords, region])

  return <CompanyHolidaySettingsContext.Provider value={value}>{children}</CompanyHolidaySettingsContext.Provider>
}
