import { formatReleaseDate, isProductionReleaseTarget, releaseNotes, visibleReleaseNotes } from '../lib/releaseNotes.js'
import '../styles/updates.css'

function TechnicalDetails({ note }) {
  if (!note.releaseId && !note.commit) return null
  return <details className="updates-page__technical">
    <summary>Technische Release-Angaben</summary>
    <dl>
      {note.releaseId && <div><dt>Release-ID</dt><dd><code>{note.releaseId}</code></dd></div>}
      {note.commit && <div><dt>Git-Commit</dt><dd><code>{note.commit}</code></dd></div>}
    </dl>
  </details>
}

function ReleaseContent({ note }) {
  return <>
    <p className="updates-page__intro">{note.intro}</p>
    <div className="updates-page__sections">
      {note.sections.map((section) => <section className="updates-page__section" key={`${section.category}-${section.title}`}>
        <h4>{section.category}{section.title ? `: ${section.title}` : ''}</h4>
        <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>)}
    </div>
    <TechnicalDetails note={note} />
  </>
}

function ReleaseHeading({ note, latest = false }) {
  return <div className="updates-page__release-heading">
    <div className="updates-page__release-labels">
      <span className="updates-page__version">Version {note.version}</span>
      {note.status === 'preview' && <span className="updates-page__preview">Vorschau · nicht veröffentlicht</span>}
    </div>
    {latest ? <h2>{note.title}</h2> : <h3>{note.title}</h3>}
    <time dateTime={note.publishedAt || undefined}>{formatReleaseDate(note.publishedAt)}</time>
  </div>
}

export default function UpdatesPage() {
  const production = isProductionReleaseTarget(import.meta.env.VITE_FIREBASE_PROJECT_ID)
  const [latest, ...older] = visibleReleaseNotes(releaseNotes, { production })

  return <div className="updates-page">
    <header className="updates-page__page-intro">
      <p className="updates-page__eyebrow">Drehpunkt · Release-Historie</p>
      <h2>Was ist neu?</h2>
      <p>Die wichtigsten Änderungen jeder veröffentlichten Version – kurz und verständlich zusammengefasst.</p>
    </header>
    {latest ? <article className="updates-page__featured" aria-label={`Neueste Version ${latest.version}`}>
      <ReleaseHeading note={latest} latest />
      <ReleaseContent note={latest} />
    </article> : <p className="updates-page__empty">Noch keine veröffentlichten Updates vorhanden.</p>}
    {older.length > 0 && <section className="updates-page__history" aria-label="Ältere Versionen">
      <h2>Frühere Versionen</h2>
      <div className="updates-page__history-list">
        {older.map((note) => <details className="updates-page__history-item" key={note.version}>
          <summary><ReleaseHeading note={note} /><span className="updates-page__expand" aria-hidden="true">⌄</span></summary>
          <div className="updates-page__history-content"><ReleaseContent note={note} /></div>
        </details>)}
      </div>
    </section>}
  </div>
}
