import { Link, useLocation } from 'react-router-dom'
import { useLanguage } from '../../i18n/useLanguage.js'
import { resolveReturnNavigation } from '../../lib/recordNavigation.js'

export default function BackLink({ className = '', to }) {
  const { t } = useLanguage()
  const location = useLocation()
  const target = resolveReturnNavigation(location.state, to, `${location.pathname}${location.search}${location.hash}`)
  return <Link className={`button button--secondary back-link${className ? ` ${className}` : ''}`} to={target.to} state={target.state}>{t('common.back')}</Link>
}
