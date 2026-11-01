import { StaticText } from '../../i18n/AutoTranslate.jsx'
import OrderMissingValue from './OrderMissingValue.jsx'

export default function OrderDistanceData({ groups, number }) {
  const rows = [['Gesamtstrecke', 'totalKm'], ['Autobahn', 'motorwayKm'], ['Leerstrecke', 'emptyKm']]
  return <section className="order-general__distances">
    <h4><StaticText source="Streckenangaben (DyCoS)" /></h4>
    <table><thead><tr><th scope="col"><StaticText source="Kilometer" /></th>{groups.map(([label]) => <th scope="col" key={label}><StaticText source={label} /></th>)}</tr></thead>
      <tbody>{rows.map(([label, key]) => <tr key={key}><th scope="row"><StaticText source={label} /></th>{groups.map(([group, data]) => <td key={group}>{Number.isFinite(data[key]) ? number(data[key], ' km') : <OrderMissingValue />}</td>)}</tr>)}
        <tr><th scope="row"><StaticText source="Geroutet" /></th>{groups.map(([group, data]) => <td key={group}>{typeof data.routed === 'boolean' ? <StaticText source={data.routed ? 'Ja' : 'Nein'} /> : <OrderMissingValue />}</td>)}</tr>
      </tbody>
    </table>
    <p className="order-workspace__muted"><StaticText source="DyCoS-Quellenwerte; tatsächliche Fahrstrecke nicht bestätigt. Tourwerte können weitere Aufträge umfassen." /></p>
  </section>
}
