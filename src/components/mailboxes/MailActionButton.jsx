import { FiArrowRight, FiClock, FiCornerUpLeft, FiFileText, FiShield } from 'react-icons/fi'
import { TbCalculator } from 'react-icons/tb'

const icons = { reply: FiCornerUpLeft, tracking: FiClock, order: FiFileText, invoice: TbCalculator, terms: FiShield }
export default function MailActionButton({ kind, children, hint, onClick, disabled = false, expanded, state = 'idle' }) {
  const Icon = icons[kind]
  const running = state === 'running'
  return <button className={`mailbox-action mailbox-action--${kind} mailbox-action--state-${state}`} type="button" onClick={onClick} disabled={disabled || running} aria-busy={running || undefined} aria-haspopup="dialog" aria-expanded={expanded}>
    <span className="mailbox-action__icon" aria-hidden="true">{running ? <span className="mailbox-action-spinner" /> : <Icon size={19} />}</span>
    <span className="mailbox-action__content"><span className="mailbox-action__label">{children}</span>{hint && <span className="mailbox-action__hint">{hint}</span>}</span>
    <FiArrowRight className="mailbox-action__arrow" size={13} aria-hidden="true" />
  </button>
}
