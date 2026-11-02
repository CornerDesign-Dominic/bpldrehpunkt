import { useState } from 'react'
import { useLanguage } from '../../i18n/useLanguage.js'
import { mailboxCall } from '../../lib/mailboxes.js'
import MailWorkDialog from '../mailboxes/MailWorkDialog.jsx'
import InvoiceReviewResults, { InvoiceReviewStatus } from '../mailboxes/InvoiceReviewResults.jsx'

export default function TransportInvoiceChecks({ orderId, number }) {
  const {language}=useLanguage()
  const w=(de,en)=>language==='en'?en:de
  const [open,setOpen]=useState(false),[reports,setReports]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[selected,setSelected]=useState(null)
  async function load(){setOpen(true);setBusy(true);setError('');try{const result=await mailboxCall('listTransportInvoiceChecks',{orderId});setReports(result.reports);setSelected(result.reports[0]||null)}catch{setError(w('Prüfberichte konnten nicht geladen werden.','Could not load review reports.'))}finally{setBusy(false)}}
  return <section className="transport-order-detail-section"><h3>{w('Rechnungsprüfung','Invoice review')}</h3><button className="button button--secondary" type="button" onClick={()=>void load()}>{w('Prüfergebnisse öffnen','Open review results')}</button>
    <MailWorkDialog open={open} title={`${w('Rechnungsprüfung','Invoice review')} · TA ${number}`} onClose={()=>setOpen(false)} rightLoading={busy} loadingLabel={w('Prüfberichte werden geladen …','Loading review reports …')} left={<><h3>{w('Gespeicherte Prüfungen','Saved reviews')}</h3>{reports.map(report=><button className="invoice-review-history-item" type="button" key={report.id} aria-pressed={selected?.id===report.id} onClick={()=>setSelected(report)}>{new Date(report.createdAt).toLocaleString(language==='en'?'en-GB':'de-DE',{timeZone:'Europe/Berlin'})}<InvoiceReviewStatus status={report.status}/></button>)}<p className="mailbox-hint">{w('Originaldokumente bleiben im persönlichen Postfach. Angezeigt wird das gespeicherte Prüfergebnis zum damaligen Datenstand.','Original documents remain in the personal mailbox. This is the saved review at its original data state.')}</p></>}>
      {error&&<p role="alert">{error}</p>}{!busy&&!error&&!reports.length&&<p>{w('Noch keine Rechnungsprüfung für diesen Transport gespeichert.','No invoice review saved for this order yet.')}</p>}{selected&&<InvoiceReviewResults report={selected}/>}
    </MailWorkDialog></section>
}
