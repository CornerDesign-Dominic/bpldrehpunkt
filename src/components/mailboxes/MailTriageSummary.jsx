import { mailTriageSourceName } from '../../lib/mailTriagePresentation.js'
import { MAIL_TRIAGE_QUESTIONS } from '../../../shared/mailboxTriage.js'
import { useLanguage } from '../../i18n/useLanguage.js'

export default function MailTriageSummary({ decision, decisionState }) {
  const { language } = useLanguage()
  const en = language === 'en'
  if (decisionState === 'unavailable') return <p role="status" className="mail-triage-warning">{en ? 'The classification could not be loaded. You can start the action manually.' : 'Die Einordnung konnte nicht geladen werden. Du kannst die Aktion manuell starten.'}</p>
  if (!decision && decisionState === 'error') return <p role="status" className="mail-triage-warning">{en ? 'Automatic classification failed. You can start the action manually.' : 'Die automatische Einordnung ist fehlgeschlagen. Du kannst die Aktion manuell starten.'}</p>
  if (!decision && decisionState === 'running') return <p role="status">{en ? 'Automatic classification is still running. You can start the action manually.' : 'Die automatische Einordnung läuft noch. Du kannst die Aktion manuell starten.'}</p>
  if (!decision) return <p>{en ? 'No saved classification is available for this message. You can start the action manually.' : 'Für diese Mail liegt keine gespeicherte Einordnung vor. Du kannst die Aktion manuell starten.'}</p>
  const coverage = decision.coverage || {}
  const coverageLabel = {
    not_present: en ? 'No attachments' : 'Keine Anhänge',
    not_read: en ? 'Attachments not read' : 'Anhänge nicht gelesen',
    partial: en ? 'Attachments considered in part' : 'Anhänge teilweise berücksichtigt',
    read: en ? 'Attachments considered' : 'Anhänge berücksichtigt',
  }[coverage.attachments] || (en ? 'Attachment coverage unknown' : 'Anhangsumfang unbekannt')
  return <div className="mail-triage-summary">
    <p className="mail-triage-state">{({ actionable: en ? 'Action identified' : 'Handlung erkannt', information: en ? 'Information only' : 'Nur Information', unclear: en ? 'Classification unclear' : 'Einordnung unklar', incomplete: en ? 'Classification incomplete' : 'Einordnung unvollständig' })[decision.status]}</p>
    <dl>{MAIL_TRIAGE_QUESTIONS.map(question => {
      const answer = decision.answers?.find(item => item.key === question.key)
      return <div key={question.key}><dt>{question[en ? 'en' : 'de']}</dt><dd>{answer?.value || (en ? 'Not established' : 'Nicht festgestellt')}{answer?.quote && <details><summary>{en ? 'Source' : 'Fundstelle'}</summary><small>{mailTriageSourceName(answer.sourceId, coverage, language)}</small><blockquote>{answer.quote}</blockquote></details>}</dd></div>
    })}<div><dt>{en ? 'What was considered?' : 'Was wurde berücksichtigt?'}</dt><dd>{coverage.mail && (coverage.mailTruncated ? en ? 'Message considered in part' : 'Mailtext auszugsweise berücksichtigt' : en ? 'Current message' : 'Aktuelle Nachricht')}{coverage.forwarded && (en ? ' · Forwarded message' : ' · Weitergeleitete Nachricht')}<br />{coverageLabel}{coverage.documentNames?.length > 0 && <small>{coverage.documentNames.join(', ')}</small>}{coverage.unreadable?.length > 0 && <small>{en ? 'Not read: ' : 'Nicht gelesen: '}{coverage.unreadable.join(', ')}</small>}</dd></div></dl>
    {decision.status === 'incomplete' && <p className="mail-triage-warning" role="status">{en ? 'The classification is incomplete. Check the originals when starting the action.' : 'Die Einordnung ist unvollständig. Beim Aktionsstart die Originale berücksichtigen.'}</p>}
  </div>
}
