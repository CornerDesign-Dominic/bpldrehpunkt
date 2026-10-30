import { FiArrowRight, FiCornerUpLeft, FiFilePlus, FiFileText, FiShield, FiTruck } from 'react-icons/fi'

const icons = { reply: FiCornerUpLeft, tracking: FiTruck, order: FiFilePlus, invoice: FiFileText, terms: FiShield }
export default function MailActionButton({ kind, children, hint, onClick, disabled = false, expanded }) {
  const Icon = icons[kind]
  return <button className={`mailbox-action mailbox-action--${kind}`} type="button" onClick={onClick} disabled={disabled} aria-haspopup="dialog" aria-expanded={expanded}>
    <span className="mailbox-action__icon" aria-hidden="true"><Icon size={19} /></span>
    <span className="mailbox-action__content"><span className="mailbox-action__label">{children}</span>{hint && <span className="mailbox-action__hint">{hint}</span>}</span>
    <FiArrowRight className="mailbox-action__arrow" size={13} aria-hidden="true" />
  </button>
}
