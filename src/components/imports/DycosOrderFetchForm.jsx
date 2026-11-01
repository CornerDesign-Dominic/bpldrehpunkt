import { useState } from 'react'
import { StaticText } from '../../i18n/AutoTranslate.jsx'
import { createImportJob, importFinished } from '../../lib/dycosImportSession.js'
import DycosImportProgress from './DycosImportProgress.jsx'

export default function DycosOrderFetchForm({ state, onOpenHistory }) {
  const [number, setNumber] = useState(''), [error, setError] = useState('')
  const { job, busy, runtime, uid } = state
  const activeJob = job && !importFinished(job)
  function submit(event) {
    event.preventDefault()
    if (busy || activeJob) return
    const taNummer = number.trim()
    if (!/^(0|[1-9]\d{0,9})$/.test(taNummer) || Number(taNummer) > 2147483647) { setError('Bitte gib eine gültige TA-Nummer ein.'); return }
    setError(''); setNumber('')
    void runtime.run(createImportJob([{ taNummer }], uid, 'single'))
  }
  return <section className="import-preparation__section dycos-import-compact">
    <h2><StaticText source="Einzelimport" /></h2>
    {!activeJob && <form className="dycos-order-fetch__form" onSubmit={submit}><label className="form-field"><span><StaticText source="TA-Nummer" /></span><input type="text" inputMode="numeric" autoComplete="off" maxLength={10} value={number} disabled={busy} onChange={event => { setNumber(event.target.value); setError('') }} /></label><button className="button" type="submit" disabled={busy || !number.trim()}><StaticText source="Importieren" /></button></form>}
    {error && <p className="form-error" role="alert"><StaticText source={error} /></p>}
    <DycosImportProgress state={state} onOpenHistory={onOpenHistory} />
  </section>
}
