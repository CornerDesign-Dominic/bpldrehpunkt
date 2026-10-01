import { Link } from 'react-router-dom'
import { useLanguage } from '../../i18n/useLanguage.js'

export default function BackLink({ className = '', to }) {
  const { t } = useLanguage()
  return <Link className={`button button--secondary back-link${className ? ` ${className}` : ''}`} to={to}>{t('common.back')}</Link>
}
