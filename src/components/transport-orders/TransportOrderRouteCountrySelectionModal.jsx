import { StaticText, TranslatedProps } from '../../i18n/AutoTranslate.jsx'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from '../icons.jsx'

function initialSelections(problems) {
  return Object.fromEntries(problems.map(({ station, countryCandidates }) => [station, countryCandidates[0]?.code || '']))
}

export default function TransportOrderRouteCountrySelectionModal({ calculating, onCancel, onConfirm, problems }) {
  const [selections, setSelections] = useState(() => initialSelections(problems))
  function submit(event) {
    event.preventDefault()
    onConfirm(selections)
  }
  return createPortal(<div className="shipment-tracking-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !calculating) onCancel() }}>
    <section className="shipment-tracking-editor transport-order-route-country-modal" role="dialog" aria-modal="true" aria-labelledby="transport-order-route-country-modal-title">
      <div className="shipment-tracking-editor__heading"><div><h2 id="transport-order-route-country-modal-title"><StaticText source={"Land bitte auswählen"} /></h2><p><StaticText source={"Das importierte Länderkürzel ist nicht eindeutig. Die Auswahl gilt nur für diese Streckenberechnung; die Importdaten bleiben unverändert."} /></p></div><TranslatedProps sources={{"aria-label":"Dialog schließen"}}><button type="button" onClick={onCancel} aria-label="Dialog schließen" disabled={calculating}><CloseIcon /></button></TranslatedProps></div>
      <form onSubmit={submit}><div className="shipment-tracking-editor__groups"><section className="transport-order-route-country-modal__choices">{problems.map(({ station, stationLabel, countryCandidates, countryValue }) => <label className="form-field" key={station}><span>{stationLabel}: „{countryValue}“</span><select value={selections[station] || ''} onChange={(event) => setSelections((current) => ({ ...current, [station]: event.target.value }))} disabled={calculating}>{countryCandidates.map(({ code, name }) => <option key={code} value={code}>{name} ({code})</option>)}</select></label>)}</section></div><div className="shipment-tracking-editor__actions"><button className="button button--secondary" type="button" disabled={calculating} onClick={onCancel}><StaticText source={"Abbrechen"} /></button><button className="button" type="submit" disabled={calculating}>{<StaticText source={calculating ? 'Wird berechnet …' : 'Strecke berechnen'} />}</button></div></form>
    </section>
  </div>, document.body)
}
