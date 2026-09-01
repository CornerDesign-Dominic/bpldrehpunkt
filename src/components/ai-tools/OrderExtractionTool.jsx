import ToolPlaceholder from './ToolPlaceholder.jsx'

export default function OrderExtractionTool() {
  return <ToolPlaceholder description="Transportauftrag als PDF einlesen und relevante Auftragsdaten automatisch extrahieren." fields={['Auftraggeber', 'Ladestelle', 'Entladestelle', 'Termine', 'Ware', 'Gewicht', 'Paletten', 'Frachtpreis', 'Referenzen']} />
}
