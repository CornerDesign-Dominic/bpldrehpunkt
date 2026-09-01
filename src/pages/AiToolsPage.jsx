import { useState } from 'react'
import AgbReviewTool from '../components/ai-tools/AgbReviewTool.jsx'
import InvoiceExtractionTool from '../components/ai-tools/InvoiceExtractionTool.jsx'
import OrderExtractionTool from '../components/ai-tools/OrderExtractionTool.jsx'

const tools = [
  { id: 'agb', label: 'AGB bewerten', Component: AgbReviewTool },
  { id: 'orders', label: 'Auftragsdaten extrahieren', Component: OrderExtractionTool },
  { id: 'invoices', label: 'Rechnungsdaten extrahieren', Component: InvoiceExtractionTool },
]

export default function AiToolsPage() {
  const [activeTool, setActiveTool] = useState('agb')
  const ActiveTool = tools.find((tool) => tool.id === activeTool)?.Component ?? AgbReviewTool

  return <div className="ai-tools-page">
    <nav className="ai-tools-tabs" aria-label="KI-Werkzeuge">
      {tools.map((tool) => <button key={tool.id} className={`ai-tools-tabs__tab ${activeTool === tool.id ? 'ai-tools-tabs__tab--active' : ''}`} type="button" onClick={() => setActiveTool(tool.id)}>{tool.label}</button>)}
    </nav>
    <ActiveTool />
  </div>
}
