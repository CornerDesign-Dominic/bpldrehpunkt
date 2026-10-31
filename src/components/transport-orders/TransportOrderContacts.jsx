import { StaticText, TranslatedProps } from '../../i18n/AutoTranslate.jsx'
import { ChevronDownIcon } from '../icons.jsx'
import CopyDetail from './TransportOrderCopyDetail.jsx'

export default function TransportOrderContacts({ imported = {} }) {
  return <details open className="transport-order-detail-section transport-order-detail-section--contacts"><summary><StaticText source="Kontakte" /><ChevronDownIcon /></summary><div className="transport-order-detail-section__content">
          <div className="transport-order-detail-contact-group"><h4><StaticText source="Kunde" /></h4><dl className="transport-order-detail-list transport-order-detail-list--single"><TranslatedProps sources={{ label: 'Kontakt im Auftrag' }}><CopyDetail label="Kontakt im Auftrag" value={imported.contacts?.customerForOrder} multiline /></TranslatedProps></dl></div>
          <div className="transport-order-detail-contact-group"><h4><StaticText source="Unternehmer" /></h4><dl className="transport-order-detail-list transport-order-detail-list--single"><TranslatedProps sources={{ label: 'TA zuletzt versendet an' }}><CopyDetail label="TA zuletzt versendet an" value={imported.dispatch?.sentTo} multiline /></TranslatedProps>{imported.contacts?.carrierForOrder && <TranslatedProps sources={{ label: 'Weitere Auftragsangaben' }}><CopyDetail label="Weitere Auftragsangaben" value={imported.contacts.carrierForOrder} multiline /></TranslatedProps>}</dl></div>
          {imported.dispositionNote && <div className="transport-order-detail-contact-group"><h4><StaticText source="Disposition" /></h4><dl className="transport-order-detail-list transport-order-detail-list--single"><TranslatedProps sources={{ label: 'Dispositionsbemerkung' }}><CopyDetail label="Dispositionsbemerkung" value={imported.dispositionNote} multiline /></TranslatedProps></dl></div>}
        </div></details>
}
