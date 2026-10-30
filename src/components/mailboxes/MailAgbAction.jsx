import MailActionButton from './MailActionButton.jsx'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../auth/useAuth.js'
import { useLanguage } from '../../i18n/useLanguage.js'
import { canView } from '../../lib/permissions.js'
import { listBusinessPartners } from '../../lib/businessPartners.js'
import { businessPartnerRoles } from '../../../shared/businessPartnerRoles.js'
import MailDocumentSources from './MailDocumentSources.jsx'
import { mailboxCall } from '../../lib/mailboxes.js'
import AgbCheckerResults from '../agb/AgbCheckerResults.jsx'
import MailWorkDialog from './MailWorkDialog.jsx'
import { useMailboxAction } from '../../mailboxes/useMailboxAction.js'

const pdfsOf = attachments => attachments.filter(item => item.contentType?.split(';')[0].toLowerCase() === 'application/pdf' || /\.pdf$/i.test(item.name || ''))
const debtorNumbers = partner => [...new Set([partner.debtorNumber, ...(partner.dycosReferences?.debtorNumbers || [])].map(value => String(value ?? '').trim()).filter(Boolean))]

export default function MailAgbAction({ identity, mailContent, attachments = [] }) {
  const { profile } = useAuth()
  const { language } = useLanguage()
  const w = (de, en) => language === 'en' ? en : de
  const [open, setOpen] = useState(false)
  const action = useMailboxAction(identity, 'terms')
  const analysis = action.result
  const busy = action.busy || action.state === 'running'
  const [startError, setStartError] = useState('')
  const [partners, setPartners] = useState(null)
  const [customerOpen, setCustomerOpen] = useState(false)
  const [partnerChoice, setPartnerChoice] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [localAssignment, setLocalAssignment] = useState(null)
  const assignment = localAssignment && localAssignment.historyId === analysis?.historyId ? localAssignment.value : analysis?.customerAssignment
  const [customerError, setCustomerError] = useState('')
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useEffect(() => {
    if (!customerOpen) return
    let current = true
    listBusinessPartners().then(items => { if (current) { setPartners(items.filter(item => !item.mergedIntoPartnerId && item.status !== 'merged' && businessPartnerRoles(item).customer)); setCustomerError('') } }).catch(() => { if (current) setCustomerError(w('Kunden konnten nicht geladen werden.', 'Could not load customers.')) })
    return () => { current = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerOpen])
  async function analyse(again = false) {
    if (busy) return
    setOpen(false); setStartError('')
    try {
      await action.start(again ? { force: true } : {})
      if (active.current) { setLocalAssignment(null); setPartnerChoice('') }
    } catch (caught) {
      if (active.current) setStartError(language === 'de' && ['functions/failed-precondition', 'functions/resource-exhausted', 'functions/permission-denied'].includes(caught.code) ? caught.message : w('Die AGB-Prüfung konnte nicht gestartet werden. Bitte erneut versuchen.', 'Could not start the terms review. Please try again.'))
    }
  }
  async function assign() {
    const [partnerId, debtorNumber] = JSON.parse(partnerChoice)
    setAssigning(true); setCustomerError('')
    try {
      const result = await mailboxCall('assignMailboxAgbCustomer', { ...identity, historyId: analysis.historyId, partnerId, debtorNumber })
      if (active.current) {
        setLocalAssignment({ historyId: analysis.historyId, value: result.customerAssignment })
        void action.refresh().catch(() => {})
      }
    } catch { if (active.current) setCustomerError(w('Die Zuordnung konnte nicht gespeichert werden. Bitte den Kunden prüfen.', 'Could not save assignment. Please check the customer.')) }
    finally { if (active.current) setAssigning(false) }
  }
  const error = startError || action.error?.message || (typeof action.error === 'string' ? action.error : '')
  return <><MailActionButton kind="terms" state={action.state} disabled={busy} expanded={open} onClick={() => { if (action.state === 'completed') { if (analysis) setOpen(true); else void action.refresh().catch(() => {}) } else void analyse() }}>{busy ? w('AGB werden geprüft …', 'Reviewing terms …') : action.state === 'completed' ? analysis ? w('AGB-Ergebnis ansehen', 'View terms result') : w('AGB-Ergebnis erneut laden', 'Reload terms result') : action.state === 'failed' ? w('AGB erneut prüfen', 'Retry terms review') : w('AGB prüfen', 'Review terms')}</MailActionButton>
    {error && <p className="mailbox-action-error" role="alert">{error}</p>}
    <MailWorkDialog open={open} title={w('AGB prüfen', 'Review terms')} left={<MailDocumentSources identity={identity} attachments={pdfsOf(attachments)} mailContent={mailContent} w={w} />} onClose={() => setOpen(false)} busy={assigning} rightLoading={busy} loadingLabel={w('PDFs werden gelesen – bei Bedarf mit OCR – und AGB geprüft …', 'Reading PDFs – using OCR if needed – and reviewing terms …')}>
      {analysis && <><p className="mailbox-hint">{w('Im AGB-Prüfer gespeichert. Geprüfte PDF-Anhänge:', 'Saved in the terms checker. Reviewed PDF attachments:')} {(analysis.sourceFiles || []).map(file => file.name).join(', ')}</p><AgbCheckerResults analysis={analysis} />
        {canView(profile, 'masterData') && <details className="mail-agb-customer" onToggle={event => setCustomerOpen(event.currentTarget.open)}><summary>{assignment ? `${w('Debitor', 'Debtor')}: ${assignment.debtorNumber}` : w('Kunden zuordnen (optional)', 'Assign customer (optional)')}</summary><label className="form-field"><span>{w('Kunde / Debitor', 'Customer / debtor')}</span><select value={partnerChoice} disabled={assigning || !partners} onChange={event => setPartnerChoice(event.target.value)}><option value="">{w('Keine Zuordnung', 'No assignment')}</option>{partners?.flatMap(partner => debtorNumbers(partner).map(number => <option key={`${partner.id}-${number}`} value={JSON.stringify([partner.id, number])}>{partner.companyName} · {number}</option>))}</select></label>{customerError && <p role="alert">{customerError}</p>}<button type="button" disabled={!partnerChoice || assigning} onClick={() => void assign()}>{assigning ? w('Wird gespeichert …', 'Saving …') : w('Zuordnung speichern', 'Save assignment')}</button>{assignment && <p role="status">{w('Zuordnung gespeichert.', 'Assignment saved.')}</p>}</details>}
        <button type="button" disabled={busy || assigning} onClick={() => void analyse(true)}>{w('AGB erneut prüfen', 'Review terms again')}</button>
      </>}
    </MailWorkDialog>
  </>
}
