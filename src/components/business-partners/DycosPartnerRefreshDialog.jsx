import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { StaticText } from '../../i18n/AutoTranslate.jsx'

export default function DycosPartnerRefreshDialog({ accounts, onChoose, onClose }) {
  const dialog = useRef(null), titleId = useId()
  useEffect(() => {
    const element = dialog.current, focused = document.activeElement
    element.showModal()
    return () => { element.close(); focused?.focus() }
  }, [])
  return createPortal(<dialog ref={dialog} className="record-history-modal dycos-partner-refresh-dialog" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose() }}>
    <header><div><h2 id={titleId}><StaticText source="Stammdaten aktualisieren" /></h2><p><StaticText source="Welche Kontonummer soll aus DyCoS abgerufen werden?" /></p></div></header>
    <div className="dycos-partner-refresh-dialog__accounts">{accounts.map(account => <button type="button" className="button button--secondary" key={`${account.typ}-${account.nummer}`} onClick={() => onChoose(account)}><StaticText source={account.typ === 'kunde' ? 'Debitorennummer' : 'Kreditorennummer'} /> {account.nummer}</button>)}</div>
    <footer><button className="button button--secondary" type="button" onClick={onClose}><StaticText source="Abbrechen" /></button></footer>
  </dialog>, document.body)
}
