import { useEffect, useState } from 'react'
import { qualityToday } from '../../lib/qualityPresentation.js'

export function useQualityToday() {
  const [today, setToday] = useState(qualityToday)
  useEffect(() => {
    const update = () => setToday(qualityToday())
    const timer = window.setInterval(update, 60000)
    window.addEventListener('focus', update)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', update) }
  }, [])
  return today
}
