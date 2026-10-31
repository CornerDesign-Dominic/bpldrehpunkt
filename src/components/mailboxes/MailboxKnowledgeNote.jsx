import { Link } from 'react-router-dom'
import { useLanguage } from '../../i18n/useLanguage.js'

export default function MailboxKnowledgeNote({ knowledge }) {
  const { language } = useLanguage()
  const text = (de, en) => language === 'en' ? en : de
  if (!knowledge) return null
  return <div className="mailbox-knowledge-note">
    {knowledge.sources?.length > 0 && <div className="mailbox-knowledge-sources"><span>{text('Wissensgrundlage:', 'Knowledge sources:')}</span>{knowledge.sources.map((source) => <Link key={`${source.kind}:${source.id}:${source.revision}`} target="_blank" rel="noreferrer" to={`/qualitaet/${source.kind === 'rule' ? 'grundregeln' : 'handbuch'}/${encodeURIComponent(source.id)}?revision=${source.revision}`}>{source.title} · {text('Rev.', 'rev.')} {source.revision}</Link>)}</div>}
    <small>{text('KI erstellt nur Entwürfe. Prüfen und Versand bleiben beim Menschen.', 'AI creates drafts only. Review and sending remain with a person.')}</small>
  </div>
}
