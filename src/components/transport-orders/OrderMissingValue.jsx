import { useLanguage } from '../../i18n/useLanguage.js'

export default function OrderMissingValue() {
  const { language } = useLanguage()
  const label = language === 'en' ? 'Not provided' : 'Nicht übermittelt'
  return <span className="order-field-missing" title={label}><span aria-hidden="true">—</span><span className="sr-only">{label}</span></span>
}
