import { Link } from 'react-router-dom'
import { useLanguage } from '../../i18n/useLanguage.js'

export default function MailboxKnowledgeNote({ knowledge }) {
  const { language } = useLanguage()
  const text = (de, en) => language === 'en' ? en : de
  if (!knowledge) return null
  const warnings = {
    knowledge_access_unavailable: ['Für die Wissenssuche fehlt die Handbuch-Leseberechtigung.', 'Handbook read access is required to search company knowledge.'],
    knowledge_search_limited: ['Der Wissenskatalog konnte nicht vollständig berücksichtigt werden.', 'The full knowledge catalog could not be considered.'],
    knowledge_match_uncertain: ['Die Situation ließ sich nicht eindeutig zuordnen. Bitte fachlich prüfen.', 'The situation could not be matched reliably. Please review it.'],
    knowledge_gap_not_recorded: ['Der Wissensbedarf konnte nicht erfasst werden.', 'The knowledge need could not be recorded.'],
    knowledge_gap_broad_category: ['Breite Prüfkategorie: Die gezählten Mails können unterschiedliche Situationen betreffen.', 'Broad review category: counted emails may concern different situations.'],
  }
  return <div className="mailbox-knowledge-note">
    {knowledge.status === 'unavailable' && <p>{knowledge.warnings?.includes('knowledge_access_unavailable') ? text('Firmenwissen wurde für diesen Vorschlag nicht verwendet.', 'Company knowledge was not used for this suggestion.') : text('Die Wissensgrundlage ist unvollständig oder nicht eindeutig. Bitte prüfen.', 'The knowledge basis is incomplete or ambiguous. Please review it.')}</p>}
    {knowledge.status === 'gap' && <p>{text('Passende interne Anweisung fehlt oder reicht nicht aus. Vorschlag fachlich prüfen.', 'Matching internal guidance is missing or incomplete. Review the suggestion carefully.')}</p>}
    {knowledge.sources?.length > 0 && <div className="mailbox-knowledge-sources"><span>{text('Wissensgrundlage:', 'Knowledge sources:')}</span>{knowledge.sources.map((source) => <Link key={`${source.kind}:${source.id}:${source.revision}`} target="_blank" rel="noreferrer" to={`/qualitaet/${source.kind === 'rule' ? 'grundregeln' : 'handbuch'}/${encodeURIComponent(source.id)}?revision=${source.revision}`}>{source.title} · {text('Rev.', 'rev.')} {source.revision}</Link>)}</div>}
    {knowledge.gap && <p><Link to="/qualitaet/wissensluecken" target="_blank" rel="noreferrer">{text('Wissenslücke:', 'Knowledge gap:')} {knowledge.gap.title}</Link>{Number.isSafeInteger(knowledge.gap.count) && <> · {knowledge.gap.count} {text('Vorkommen', 'occurrences')}</>}</p>}
    {knowledge.warnings?.map((warning, index) => <p key={index}>{warnings[warning]?.[language === 'en' ? 1 : 0] || text('Wissenszuordnung bitte prüfen.', 'Please review the knowledge match.')}</p>)}
    <small>{text('KI erstellt nur Entwürfe. Prüfen und Versand bleiben beim Menschen.', 'AI creates drafts only. Review and sending remain with a person.')}</small>
  </div>
}
