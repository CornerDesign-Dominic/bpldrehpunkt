import MailActionButton from './MailActionButton.jsx'
import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../../i18n/useLanguage.js'
import { mailboxCall } from '../../lib/mailboxes.js'
import MailWorkDialog from './MailWorkDialog.jsx'
import MailDocumentSources from './MailDocumentSources.jsx'
import InvoiceReviewResults from './InvoiceReviewResults.jsx'

export default function MailInvoiceAction({ identity, mailContent, attachments = [] }) {
  const { language } = useLanguage()
  const w = (de,en) => language === 'en' ? en : de
  const [open,setOpen] = useState(false), [report,setReport] = useState(null), [busy,setBusy] = useState(false), [error,setError] = useState('')
  const operation = useRef(crypto.randomUUID()), active = useRef(true)
  useEffect(() => {active.current=true;return()=>{active.current=false}},[])
  async function review(again = false) {
    if(busy)return
    if(again)operation.current=crypto.randomUUID()
    setBusy(true);setError('')
    try {const result=await mailboxCall('reviewMailboxInvoices',{...identity,operationId:operation.current});if(active.current)setReport(result)}
    catch(caught){if(active.current)setError(language==='de' && ['functions/failed-precondition','functions/permission-denied','functions/resource-exhausted'].includes(caught.code)?caught.message:w('Die Rechnungsprüfung konnte nicht abgeschlossen werden. Bitte erneut versuchen.','Could not complete the invoice review. Please try again.'))}
    finally{if(active.current)setBusy(false)}
  }
  const pdfs=attachments.filter(file=>file.contentType?.split(';')[0].toLowerCase()==='application/pdf'||/\.pdf$/i.test(file.name||''))
  return <><MailActionButton kind="invoice" expanded={open} onClick={()=>{setOpen(true);if(!report&&!busy)void review()}}>{w('Rechnungsprüfung','Review invoice')}</MailActionButton>
    <MailWorkDialog open={open} title={w('Rechnungsprüfung','Invoice review')} left={<MailDocumentSources identity={identity} mailContent={mailContent} attachments={pdfs} w={w}/>} onClose={()=>setOpen(false)} rightLoading={busy} loadingLabel={w('Rechnungen werden gelesen und geprüft – bei Bedarf mit OCR …','Reading and reviewing invoices – using OCR if needed …')}>
      {error&&<div className="mailbox-error" role="alert">{error}<p><button type="button" onClick={()=>void review()} disabled={busy}>{w('Erneut versuchen','Try again')}</button></p></div>}
      {report&&<><InvoiceReviewResults report={report}/><button type="button" disabled={busy} onClick={()=>void review(true)}>{w('Mit aktuellen Auftragsdaten erneut prüfen','Review against current order data')}</button></>}
    </MailWorkDialog></>
}
