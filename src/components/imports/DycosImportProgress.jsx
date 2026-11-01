import { StaticText } from '../../i18n/AutoTranslate.jsx'
import { Link } from 'react-router-dom'
import { importFinished } from '../../lib/dycosImportSession.js'
import { bulkImportCounts } from '../../lib/dycosBulkImport.js'
import { dycosImportWarnings } from '../../lib/dycosOrderFetchFeedback.js'

export default function DycosImportProgress({ state, onOpenHistory }) {
  const { job, busy, error, waiting, runtime } = state
  if (!job) return error ? <p className="form-error" role="alert"><StaticText source={error} /></p> : null
  const counts = bulkImportCounts(job), done = (counts.new || 0) + (counts.updated || 0) + (counts.unchanged || 0), complete = importFinished(job)
  const warnings = [...new Set(job.items.flatMap(dycosImportWarnings))]
  return <div className="dycos-import-status" aria-live="polite">
    {error && <p className="form-error" role="alert"><StaticText source={error} /></p>}
    {state.blockingRun && <Link className="button button--secondary" to={`/transportauftraege/import/${state.blockingRun.kind === 'bulk' ? 'sammel' : 'einzel'}?vorgang=${encodeURIComponent(state.blockingRun.id)}`}><StaticText source="Offenen Vorgang öffnen" /></Link>}
    <p><strong><StaticText source={complete ? 'Erfolgreich' : busy ? 'Import läuft …' : 'Import unterbrochen oder mit Fehlern'} /></strong> · {done} / {job.items.length} <StaticText source="erfolgreich übernommen" />{counts.failed > 0 && <> · {counts.failed} <StaticText source="fehlgeschlagen" /></>}</p>
    {busy && <progress max={job.items.length} value={done + (counts.failed || 0)} />}
    {waiting && <p><StaticText source="Abruflimit erreicht. Der Import wird automatisch fortgesetzt." /></p>}
    {busy && <p className="dycos-bulk-import__hint"><StaticText source="Der Import läuft in diesem Tab weiter. Du kannst im anderen Tab weiterarbeiten. Bei geschlossenem Tab ist eine Wiederaufnahme möglich." /></p>}
    <div className="dycos-bulk-import__actions"><button className="button button--secondary" type="button" onClick={() => onOpenHistory(job.runId)}><StaticText source="Details im Importverlauf" /></button>
      {busy ? <button className="button button--secondary" type="button" onClick={() => runtime.pause()}><StaticText source="Nach laufendem Auftrag pausieren" /></button> : !complete && <><button className="button" type="button" onClick={() => void runtime.run({ ...job, items: job.items.map(item => item.status === 'failed' ? { ...item, status: 'pending' } : item) })}><StaticText source="Import fortsetzen" /></button><button className="button button--secondary" type="button" onClick={() => void runtime.discard()}><StaticText source="Vorgang beenden" /></button></>}
    </div>
    {warnings.length > 0 && <details><summary><StaticText source="Hinweise zu importierten Aufträgen" /></summary>{warnings.map(message => <p className="dycos-bulk-import__hint" key={message}><StaticText source={message} /></p>)}</details>}
  </div>
}
