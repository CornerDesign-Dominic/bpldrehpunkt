import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import BackLink from '../components/ui/BackLink.jsx'
import { StaticText } from '../i18n/AutoTranslate.jsx'
import { usePermissions } from '../auth/usePermissions.js'
import DycosOrderFetchForm from '../components/imports/DycosOrderFetchForm.jsx'
import DycosBulkOrderImport from '../components/imports/DycosBulkOrderImport.jsx'
import TransportOrderImportHistory from '../components/imports/TransportOrderImportHistory.jsx'
import { useDycosImport } from '../components/imports/useDycosImport.js'
import { resumeImportJob } from '../lib/dycosImportSession.js'

function ImportPage({ kind }) {
  const [params] = useSearchParams()
  const state = useDycosImport(kind), [openRequest, setOpenRequest] = useState(null)
  const linkedRunId = params.get('vorgang')
  useEffect(() => { let active = true; if (linkedRunId) void Promise.resolve().then(() => { if (active) setOpenRequest({ id: linkedRunId }) }); return () => { active = false } }, [linkedRunId])
  const onOpenHistory = id => setOpenRequest({ id, at: Date.now() })
  const revision = state.busy ? 'running' : `${state.job?.runId || ''}:${state.job?.items.map(item => item.status).join(',') || ''}`
  return <div className="import-page customer-import-page transport-order-import-page"><div className="import-page__navigation"><BackLink to="/transportauftraege" /></div>
    {kind === 'single' ? <DycosOrderFetchForm state={state} onOpenHistory={onOpenHistory} /> : <DycosBulkOrderImport state={state} onOpenHistory={onOpenHistory} />}
    <TransportOrderImportHistory kind={kind} revision={revision} openRequest={openRequest} busy={state.busy} onResume={detail => void state.runtime.run(resumeImportJob(detail, state.uid))} />
  </div>
}

export default function TransportOrderImportPage({ kind }) {
  const { canEdit } = usePermissions()
  if (kind) return <ImportPage key={kind} kind={kind} />
  return <div className="import-page customer-import-page"><div className="import-page__navigation"><BackLink to="/transportauftraege" /></div><section className="import-preparation__section"><h2><StaticText source="Transportaufträge importieren" /></h2><div className="dycos-bulk-import__actions">
    {canEdit('transportOrderSingleImport') && <Link className="button" to="/transportauftraege/import/einzel" target="_blank" rel="noopener"><StaticText source="Einzelimport" /></Link>}
    {canEdit('transportOrderBulkImport') && <Link className="button" to="/transportauftraege/import/sammel" target="_blank" rel="noopener"><StaticText source="Sammelimport" /></Link>}
  </div></section></div>
}
