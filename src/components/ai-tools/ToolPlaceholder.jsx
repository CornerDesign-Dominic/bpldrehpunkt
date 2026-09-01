export default function ToolPlaceholder({ description, fields }) {
  return <section className="ai-tool-workspace">
    <p className="ai-tool-workspace__description">{description}</p>
    <div className="ai-tool-workspace__grid">
      <section className="ai-placeholder-panel">
        <div><h2>PDF hochladen</h2><p>Dokumentauswahl wird in einem späteren Schritt angebunden.</p></div>
        <button className="button button--secondary" type="button" disabled>PDF auswählen</button>
      </section>
      <section className="ai-placeholder-panel">
        <div><h2>Analyse</h2><p>Die Auswertung steht nach dem Upload zur Verfügung.</p></div>
        <button className="button" type="button" disabled>Analyse starten</button>
      </section>
    </div>
    <section className="ai-result-placeholder">
      <div><h2>Ergebnis</h2><p>Strukturierte Ergebnisse werden hier später angezeigt.</p></div>
      <ul>{fields.map((field) => <li key={field}>{field}</li>)}</ul>
    </section>
  </section>
}
