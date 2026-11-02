import { StaticText } from '../../i18n/AutoTranslate.jsx'
import { usePermissions } from '../../auth/usePermissions.js'
import { businessPartnerDetailPath } from '../../lib/businessPartnerLinks.js'
import ContextLink from '../ui/ContextLink.jsx'

export default function PartnerReferenceLink({ partnerId, newTab = false, label = 'Stammdaten öffnen' }) {
  const { canView } = usePermissions()
  if (!partnerId || !canView('masterData')) return null
  return <ContextLink to={businessPartnerDetailPath(partnerId)} target={newTab ? '_blank' : undefined} rel={newTab ? 'noopener noreferrer' : undefined} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}><StaticText source={newTab ? 'Stammdaten in neuem Tab öffnen' : label} /></ContextLink>
}
