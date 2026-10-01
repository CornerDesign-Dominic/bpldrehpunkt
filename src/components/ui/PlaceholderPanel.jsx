import { useLanguage } from '../../i18n/useLanguage.js'

export default function PlaceholderPanel({ label }) {
  const { t } = useLanguage()
  return (
    <section className="placeholder-panel" aria-label={t('common.comingSoon', { label })}>
      <span>{label}</span>
    </section>
  )
}
