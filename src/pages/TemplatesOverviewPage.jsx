import { Link } from 'react-router-dom'
import { TemplatesIcon } from '../components/icons.jsx'
import { useLanguage } from '../i18n/useLanguage.js'

export default function TemplatesOverviewPage() {
  const { t } = useLanguage()
  return <div className="templates-page">
    <section className="templates-intro"><div><h2>{t('templates.intro')}</h2><p>{t('templates.hint')}</p></div></section>
    <div className="templates-grid"><Link className="template-card" to="/vorlagen/haftbarhaltung"><span className="template-card__icon"><TemplatesIcon size={23} /></span><span><strong>{t('templates.liability')}</strong><small>{t('templates.liabilityHint')}</small></span><span className="template-card__open">{t('templates.open')}</span></Link><Link className="template-card" to="/vorlagen/geschaeftsdokument"><span className="template-card__icon"><TemplatesIcon size={23} /></span><span><strong>{t('templates.business')}</strong><small>{t('templates.businessHint')}</small></span><span className="template-card__open">{t('templates.open')}</span></Link></div>
  </div>
}
