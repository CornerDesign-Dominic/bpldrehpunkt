import { useLanguage } from '../i18n/useLanguage.js'
import { localeForLanguage } from '../i18n/translations.js'

const dashboardUpdates = [
  {
    id: 'agb-checker-history',
    date: '2026-10-02',
    titleKey: 'dashboard.update.agbHistoryTitle',
    summaryKey: 'dashboard.update.agbHistorySummary',
    tagKey: 'dashboard.update.extensionTag',
  },
  {
    id: 'english-interface',
    date: '2026-10-01',
    titleKey: 'dashboard.update.languageTitle',
    summaryKey: 'dashboard.update.languageSummary',
    tagKey: 'dashboard.update.newTag',
  },
].sort((left, right) => right.date.localeCompare(left.date))

export default function DashboardPage() {
  const { language, t } = useLanguage()
  const dateFormatter = new Intl.DateTimeFormat(localeForLanguage(language), {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
  return (
    <div className="dashboard-page">
      <section className="dashboard-card">
        <div className="dashboard-welcome">
          <h2>{t('dashboard.welcome')}</h2>
          <p>{t('dashboard.intro')}</p>
          <p>{t('dashboard.feedback')}</p>
          <p>{t('dashboard.feedbackThanks')}</p>
          <p>{t('dashboard.enjoy')}</p>
        </div>
      </section>
      <div className="dashboard-card" aria-hidden="true" />
      <section className="dashboard-card dashboard-card--updates" aria-labelledby="dashboard-updates-title">
        <h2 id="dashboard-updates-title">{t('dashboard.updates')}</h2>
        <div className="dashboard-updates-list">
          {dashboardUpdates.map((update) => (
            <article className="dashboard-update" key={update.id}>
              <div className="dashboard-update__heading">
                <h3>{t(update.titleKey)}</h3>
                <div className="dashboard-update__meta">
                  <span className="dashboard-update__tag">{t(update.tagKey)}</span>
                  <time dateTime={update.date}>{dateFormatter.format(new Date(`${update.date}T12:00:00`))}</time>
                </div>
              </div>
              <p>{t(update.summaryKey)}</p>
            </article>
          ))}
        </div>
      </section>
      <div className="dashboard-card" aria-hidden="true" />
    </div>
  )
}
