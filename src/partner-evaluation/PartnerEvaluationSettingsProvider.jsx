import { useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { useAuth } from '../auth/useAuth.js'
import { db, functions } from '../lib/firebase.js'
import { normalizePartnerEvaluationSettings, PARTNER_EVALUATION_DEFAULTS } from '../lib/partnerEvaluation.js'
import { PartnerEvaluationSettingsContext } from './partnerEvaluationSettingsContext.js'

const settingsRef = doc(db, 'appSettings', 'partnerEvaluation')

export function PartnerEvaluationSettingsProvider({ children }) {
  const { user } = useAuth()
  const [settings, setSettings] = useState(PARTNER_EVALUATION_DEFAULTS)
  const [loading, setLoading] = useState(Boolean(user))

  useEffect(() => {
    if (!user) return undefined
    return onSnapshot(settingsRef, (snapshot) => {
      setSettings(normalizePartnerEvaluationSettings(snapshot.exists() ? snapshot.data() : null))
      setLoading(false)
    }, () => {
      setSettings(PARTNER_EVALUATION_DEFAULTS)
      setLoading(false)
    })
  }, [user])

  const value = useMemo(() => ({
    settings,
    loading,
    async saveSettings(nextSettings) {
      const response = await httpsCallable(functions, 'updatePartnerEvaluationSettings')({ settings: nextSettings })
      const saved = normalizePartnerEvaluationSettings(response.data?.settings ?? nextSettings)
      setSettings(saved)
      return saved
    },
  }), [loading, settings])

  return <PartnerEvaluationSettingsContext.Provider value={value}>{children}</PartnerEvaluationSettingsContext.Provider>
}
