import { StaticText } from '../../i18n/AutoTranslate.jsx'

export default function OrderGeneralData({ imported, number }) {
  const shipment = imported.shipment || {}
  const totals = [['Auftragsmenge', shipment.packages, 'Kolli'], ['Gewicht (Auftrag)', shipment.weightKg, 'kg'], ['Lademeter (Auftrag)', shipment.loadingMeters, 'm']].filter(([, value]) => Number.isFinite(value))
  return <>
    <div className="order-general__columns">
      <div className="order-general__vehicle">
        <span className="order-station__label"><StaticText source="Fahrzeugart" /></span>
        <p className="order-general__vehicle-type">{shipment.vehicleType || <StaticText source="Nicht übermittelt" />}</p>
        {shipment.licensePlate && <p className="order-general__plate"><span className="order-station__label"><StaticText source="Kennzeichen" /></span>{shipment.licensePlate}</p>}
        {imported.source?.tourId != null && imported.source.tourId !== '' && <p className="order-general__tour"><StaticText source="Tour-ID (DyCoS)" />: <strong>{imported.source.tourId}</strong></p>}
      </div>
      <section className={`order-general__instructions${imported.dispositionNote ? ' order-general__instructions--present' : ''}`}>
        <h4><StaticText source="Allgemeine Hinweise" /></h4>
        <p>{imported.dispositionNote || <StaticText source="Keine allgemeinen Hinweise übermittelt." />}</p>
      </section>
    </div>
    {totals.length > 0 && <dl className="order-general__totals">{totals.map(([label, value, unit]) => <div key={label}><dt><StaticText source={label} /></dt><dd>{number(value)} <small>{unit === 'Kolli' ? <StaticText source="Kolli" /> : unit}</small></dd></div>)}</dl>}
  </>
}
