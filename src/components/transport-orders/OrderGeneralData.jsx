import { StaticText } from '../../i18n/AutoTranslate.jsx'
import OrderMissingValue from './OrderMissingValue.jsx'

export default function OrderGeneralData({ imported, number }) {
  const shipment = imported.shipment || {}
  const totals = [['Auftragsmenge', shipment.packages, 'Kolli'], ['Gewicht (Auftrag)', shipment.weightKg, 'kg'], ['Lademeter (Auftrag)', shipment.loadingMeters, 'm']].filter(([, value]) => Number.isFinite(value))
  return <>
    <div className="order-general__columns">
      <div className="order-general__vehicle">
        <span className="order-station__label"><StaticText source="Fahrzeugart" /></span>
        <p className="order-general__vehicle-type">{shipment.vehicleType || <OrderMissingValue />}</p>
        {shipment.licensePlate && <p className="order-general__plate"><span className="order-station__label"><StaticText source="Kennzeichen" /></span>{shipment.licensePlate}</p>}
        {shipment.vehicleInformation && <div className="order-general__vehicle-information"><h4><StaticText source="Fahrzeughinweise" /></h4><p>{shipment.vehicleInformation}</p></div>}
        {imported.source?.tourId != null && imported.source.tourId !== '' && <p className="order-general__tour"><StaticText source="Tour-ID (DyCoS)" />: <strong>{imported.source.tourId}</strong></p>}
      </div>
      <div className="order-general__information">
        <section className={`order-general__instructions${imported.dispositionNote ? ' order-general__instructions--present' : ''}`}>
          <h4><StaticText source="Allgemeine Hinweise" /></h4>
          <p>{imported.dispositionNote || <OrderMissingValue />}</p>
        </section>
        <section className="order-general__goods"><h4><StaticText source="Ware (Auftrag)" /></h4><p>{shipment.goodsDescription || <OrderMissingValue />}</p><p className="order-general__hazardous"><StaticText source="Gefahrgut (Auftrag)" />: <strong>{typeof shipment.hazardousGoods === 'boolean' ? <StaticText source={shipment.hazardousGoods ? 'Ja' : 'Nein'} /> : <OrderMissingValue />}</strong></p></section>
      </div>
    </div>
    {totals.length > 0 && <dl className="order-general__totals">{totals.map(([label, value, unit]) => <div key={label}><dt><StaticText source={label} /></dt><dd>{number(value)} <small>{unit === 'Kolli' ? <StaticText source="Kolli" /> : unit}</small></dd></div>)}</dl>}
  </>
}
