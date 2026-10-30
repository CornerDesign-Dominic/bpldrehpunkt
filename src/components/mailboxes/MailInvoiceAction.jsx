import MailActionButton from './MailActionButton.jsx'
import { useState } from 'react'
import { useLanguage } from '../../i18n/useLanguage.js'
import { useMailboxAction } from '../../mailboxes/useMailboxAction.js'
import MailWorkDialog from './MailWorkDialog.jsx'
import MailDocumentSources from './MailDocumentSources.jsx'
import InvoiceReviewResults from './InvoiceReviewResults.jsx'

export default function MailInvoiceAction({ identity, mailContent, attachments = [] }) {
  const { language } = useLanguage()
  const w = (de,en) => language === 'en' ? en : de
  const [open,setOpen] = useState(false), [startError,setStartError] = useState('')
  const action = useMailboxAction(identity, 'invoice')
  const report = action.result
  const busy = action.busy || action.state === 'running'
  async function review(again = false) {
    if(busy)return
    setOpen(false);setStartError('')
    try {await action.start(again ? {force:true} : {})}
    catch(caught){setStartError(language==='de' && ['functions/failed-precondition','functions/permission-denied','functions/resource-exhausted'].includes(caught.code)?caught.message:w('Die Rechnungsprüfung konnte nicht gestartet werden. Bitte erneut versuchen.','Could not start the invoice review. Please try again.'))}
  }
  const error = startError || action.error?.message || (typeof action.error === 'string' ? action.error : '')
  const pdfs=attachments.filter(file=>file.contentType?.split(';')[0].toLowerCase()==='application/pdf'||/\.pdf$/i.test(file.name||''))
  return <><MailActionButton kind="invoice" state={action.state} disabled={busy} expanded={open} onClick={()=>{if(action.state==='completed'){if(report)setOpen(true);else void action.refresh().catch(()=>{})}else void review()}}>{busy?w('Rechnung wird geprüft …','Reviewing invoice …'):action.state==='completed'?report?w('Rechnungsergebnis ansehen','View invoice result'):w('Rechnungsergebnis erneut laden','Reload invoice result'):action.state==='failed'?w('Rechnung erneut prüfen','Retry invoice review'):w('Rechnungsprüfung','Review invoice')}</MailActionButton>
    {error&&<p className="mailbox-action-error" role="alert">{error}</p>}
    <MailWorkDialog open={open} title={w('Rechnungsprüfung','Invoice review')} left={<MailDocumentSources identity={identity} mailContent={mailContent} attachments={pdfs} w={w}/>} onClose={()=>setOpen(false)} rightLoading={busy} loadingLabel={w('Rechnungen werden gelesen und geprüft – bei Bedarf mit OCR …','Reading and reviewing invoices – using OCR if needed …')}>
      {report&&<><InvoiceReviewResults report={report}/><button type="button" disabled={busy} onClick={()=>void review(true)}>{w('Mit aktuellen Auftragsdaten erneut prüfen','Review against current order data')}</button></>}
    </MailWorkDialog></>
}
