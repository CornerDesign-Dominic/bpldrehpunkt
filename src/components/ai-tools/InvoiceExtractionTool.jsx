import ToolPlaceholder from './ToolPlaceholder.jsx'

export default function InvoiceExtractionTool() {
  return <ToolPlaceholder description="Rechnung als PDF einlesen und relevante Rechnungsdaten automatisch erkennen." fields={['Rechnungsnummer', 'Rechnungsdatum', 'Lieferant', 'Netto', 'Umsatzsteuer', 'Brutto', 'Zahlungsziel', 'Bankverbindung']} />
}
