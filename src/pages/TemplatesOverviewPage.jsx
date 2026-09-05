import { Link } from 'react-router-dom'
import { TemplatesIcon } from '../components/icons.jsx'

export default function TemplatesOverviewPage() {
  return <div className="templates-page">
    <section className="templates-intro"><div><h2>Briefvorlagen</h2><p>Erstellen Sie standardisierte Geschäftsschreiben direkt aus einer Vorlage.</p></div></section>
    <div className="templates-grid"><Link className="template-card" to="/vorlagen/haftbarhaltung"><span className="template-card__icon"><TemplatesIcon size={23} /></span><span><strong>Haftbarhaltung</strong><small>Haftbarhaltung für einen Transportauftrag erstellen</small></span><span className="template-card__open">Öffnen</span></Link></div>
  </div>
}
