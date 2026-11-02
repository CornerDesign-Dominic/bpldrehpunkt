import { StaticText, TranslatedProps } from '../../i18n/AutoTranslate.jsx'
import { businessPartnerRoles } from '../../../shared/businessPartnerRoles.js'
import { businessPartnerRoleSelectionValue, parseBusinessPartnerRoleSelection } from '../../lib/caseTransportLinks.js'
import PartnerReferenceLink from '../business-partners/PartnerReferenceLink.jsx'

export default function LegalDisputeCounterpartyField({ value, partners = [], canViewMasterData, disabled, allowLegacyText = false, onChange }) {
  const selection = businessPartnerRoleSelectionValue(value.counterpartyPartnerRole, value.counterpartyPartnerId)
  const options = partners.filter((partner) => !partner.mergedIntoPartnerId && partner.status !== 'merged')
    .flatMap((partner) => ['customer', 'carrier'].filter((role) => businessPartnerRoles(partner)[role]).map((role) => ({ partner, role, value: businessPartnerRoleSelectionValue(role, partner.id) })))
  function select(nextSelection) {
    const { partnerId, role } = parseBusinessPartnerRoleSelection(nextSelection)
    const partner = partners.find((entry) => entry.id === partnerId)
    onChange({ counterparty: partner?.companyName || '', counterpartyPartnerId: partnerId || null, counterpartyPartnerRole: role || null, counterpartySourceTransportOrderId: null })
  }
  return <div className="form-field"><label className="form-field"><span><StaticText source="Gegenseite" /></span>{canViewMasterData ? <select value={selection} disabled={disabled} onChange={(event) => select(event.target.value)}>
    <option value="">{value.counterparty && !selection ? value.counterparty : <StaticText source="Keine Gegenseite ausgewählt" />}</option>
    {selection && !options.some((option) => option.value === selection) && <option value={selection}>{value.counterparty || <StaticText source="Verknüpfte Gegenseite" />}</option>}
    {['customer', 'carrier'].map((role) => <TranslatedProps key={role} sources={{ label: role === 'customer' ? 'Kunden' : 'Unternehmer' }}><optgroup label={role === 'customer' ? 'Kunden' : 'Unternehmer'}>{options.filter((option) => option.role === role).map((option) => <option key={option.value} value={option.value}>{option.partner.companyName}</option>)}</optgroup></TranslatedProps>)}
  </select> : <span>{value.counterparty || '—'}</span>}</label>
    {allowLegacyText && !selection && <TranslatedProps sources={{ 'aria-label': 'Gegenseite ohne Stammdatenverknüpfung' }}><input aria-label="Gegenseite ohne Stammdatenverknüpfung" value={value.counterparty || ''} maxLength="240" disabled={disabled} onChange={(event) => onChange({ counterparty: event.target.value })} /></TranslatedProps>}
    {canViewMasterData && selection && <PartnerReferenceLink partnerId={value.counterpartyPartnerId} newTab />}
  </div>
}
