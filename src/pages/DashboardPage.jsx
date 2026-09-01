import PlaceholderPanel from '../components/ui/PlaceholderPanel.jsx'

export default function DashboardPage() {
  return (
    <div className="dashboard-page">
      <div className="dashboard-intro">
        <p>Übersicht</p>
        <span>Der zentrale Einstiegspunkt für die künftigen Arbeitsbereiche.</span>
      </div>
      <div className="dashboard-grid">
        <PlaceholderPanel label="Kennzahlen" />
        <PlaceholderPanel label="Hinweise" />
        <PlaceholderPanel label="Interne News" />
      </div>
    </div>
  )
}
