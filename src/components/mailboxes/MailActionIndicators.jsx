import { useAuth } from '../../auth/useAuth.js'
import { canEdit, canView } from '../../lib/permissions.js'
import { FiBriefcase, FiClock, FiFileText, FiShield } from 'react-icons/fi'
import { TbCalculator } from 'react-icons/tb'
import { useLanguage } from '../../i18n/useLanguage.js'
import { mailboxActionKey, mailboxActionKinds } from '../../lib/mailboxActionStore.js'
import { mailboxActionDisplayState } from '../../lib/mailboxActionPresentation.js'
import '../../styles/mailboxActionIndicators.css'

const icons = { order: FiFileText, tracking: FiClock, terms: FiShield, invoice: TbCalculator, todo: FiBriefcase, damage: FiBriefcase, collection: FiBriefcase, court: FiBriefcase, calendar: FiBriefcase }
const names = { order: ['Auftrag', 'Order'], tracking: ['Sendungsstatus', 'Shipment status'], terms: ['AGB-Prüfung', 'Terms review'], invoice: ['Rechnungsprüfung', 'Invoice review'], todo: ['To-do', 'To-do'], damage: ['Schaden', 'Damage'], collection: ['Inkasso', 'Collection'], court: ['Gericht', 'Court'], calendar: ['Kalender', 'Calendar'] }

export default function MailActionIndicators({ identity, actions, recommendations = [] }) {
  const { language } = useLanguage()
  const { profile } = useAuth()
  const allowed = kind => kind === 'order' ? canEdit(profile, 'transportOrders') && canView(profile, 'masterData') : kind === 'terms' ? canView(profile, 'agbChecker') : kind === 'calendar' ? canView(profile, 'calendar') : canEdit(profile, ({ tracking: 'transportOrders', order: 'transportOrders', invoice: 'transportOrders', todo: 'todos', damage: 'damages', collection: 'inkasso', court: 'legalDisputes' })[kind])
  const visible = mailboxActionKinds.map(kind => ({ kind, action: { state: mailboxActionDisplayState(actions[mailboxActionKey(identity, kind)], recommendations.includes(kind) && allowed(kind)) } })).filter(({ action }) => ['running', 'review', 'completed', 'recommended'].includes(action.state))
  if (!visible.length) return null
  return <span className="mailbox-action-indicators">{visible.map(({ kind, action }) => {
    const Icon = icons[kind]
    const status = action.state === 'recommended' ? language === 'en' ? 'AI recommendation' : 'KI-Empfehlung' : action.state === 'running' ? language === 'en' ? 'Running' : 'Wird ausgewertet' : action.state === 'review' ? language === 'en' ? 'Review required' : 'Zur Übernahme bereit' : language === 'en' ? 'Completed' : 'Abgeschlossen'
    const label = `${names[kind][language === 'en' ? 1 : 0]} · ${status}`
    return <span key={kind} className={`mailbox-action-indicator mailbox-action-indicator--${action.state}`} role="img" aria-label={label} title={label}>{action.state === 'running' ? <span className="mailbox-action-spinner" aria-hidden="true" /> : <Icon aria-hidden="true" />}</span>
  })}</span>
}
