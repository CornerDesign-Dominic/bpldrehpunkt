import MailActionButton from './MailActionButton.jsx'
import { useState } from 'react'
import { useLanguage } from '../../i18n/useLanguage.js'
import { useMailboxAction } from '../../mailboxes/useMailboxAction.js'
import MailWorkDialog from './MailWorkDialog.jsx'
import MailDocumentSources from './MailDocumentSources.jsx'
import InvoiceReviewResults from './InvoiceReviewResults.jsx'

export default function MailInvoiceAction({ identity, mailContent, attachments = [], recommended = false }) {
  const { language } = useLanguage()
  const w = (de, en) => language === 'en' ? en : de
  const [open, setOpen] = useState(false), [startError, setStartError] = useState('')
  const action = useMailboxAction(identity, 'invoice', recommended)
  const report = action.result
  const busy = action.busy || action.state === 'running'
  const hasResult = ['review', 'completed'].includes(action.state)
  const finished = action.displayState === 'completed'
  async function review(again = false) {
    if (busy) return
    setOpen(false); setStartError('')
    try { await action.start(again ? { force: true } : {}) }
    catch (caught) { setStartError(language === 'de' && ['functions/failed-precondition', 'functions/permission-denied', 'functions/resource-exhausted'].includes(caught.code) ? caught.message : w('Die Rechnungsprüfung konnte nicht gestartet werden. Bitte erneut versuchen.', 'Could not start the invoice review. Please try again.')) }
  }
  async function toggleFinished() {
    if (busy) return
    setStartError('')
    try {
      if (finished) await action.reopen()
      else await action.complete()
    } catch {
      setStartError(w('Der Prüfstatus konnte nicht gespeichert werden. Bitte erneut versuchen.', 'Could not save the review status. Please try again.'))
    }
  }
  const error = startError || action.error?.message || (typeof action.error === 'string' ? action.error : '')
  const documents = attachments.filter(file => !file.isInline && (/^(application\/pdf|image\/(jpeg|png|webp|gif))$/.test(file.contentType?.split(';')[0].toLowerCase() || '') || /\.(pdf|jpe?g|png|webp|gif)$/i.test(file.name || '')))
  return <><MailActionButton kind="invoice" state={action.state === 'failed' ? 'idle' : action.displayState} disabled={busy} expanded={open} onClick={() => {
    if (hasResult) {
      if (report) setOpen(true)
      else void action.refresh().catch(() => {})
    } else void review()
  }}>{busy ? action.pending && action.state !== 'running' ? w('Prüfstatus wird gespeichert …', 'Saving review status …') : w('Rechnung wird geprüft …', 'Reviewing invoice …') : hasResult ? report ? w('Rechnungsergebnis ansehen', 'View invoice result') : w('Rechnungsergebnis erneut laden', 'Reload invoice result') : action.state === 'failed' ? w('Rechnung erneut prüfen', 'Retry invoice review') : w('Rechnungsprüfung', 'Review invoice')}</MailActionButton>
    {error && !open && <p className="mailbox-action-error" role="alert">{error}</p>}
    <MailWorkDialog open={open} title={w('Rechnungsprüfung', 'Invoice review')} left={<MailDocumentSources identity={identity} mailContent={mailContent} attachments={documents} w={w} />} onClose={() => setOpen(false)} busy={Boolean(action.pending)} rightLoading={action.state === 'running' || action.loadingResult} loadingLabel={w('Rechnungen werden gelesen und geprüft – bei Bedarf mit OCR …', 'Reading and reviewing invoices – using OCR if needed …')} footer={report && <>
      <button className="mail-work-footer__secondary" type="button" disabled={busy} onClick={() => void review(true)}>{w('Mit aktuellen Auftragsdaten erneut prüfen', 'Review against current order data')}</button>
      <button className="mail-work-footer__primary" type="button" disabled={busy || !hasResult} onClick={() => void toggleFinished()}>{action.pending ? w('Wird gespeichert …', 'Saving …') : finished ? w('Wieder in Bearbeitung setzen', 'Set back to in progress') : w('Prüfung fertig', 'Finish review')}</button>
    </>}>
      {error && open && <p className="mailbox-action-error" role="alert">{error}</p>}
      {report && <InvoiceReviewResults report={report} />}
    </MailWorkDialog></>
}
