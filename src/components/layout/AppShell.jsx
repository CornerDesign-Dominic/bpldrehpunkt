import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import Header from './Header.jsx'
import Sidebar from './Sidebar.jsx'

const pageTitles = {
  '/dashboard': 'Dashboard',
  '/kunden-unternehmer': 'Kunden & Unternehmer',
}

export default function AppShell({ children }) {
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false)
  const location = useLocation()
  const title = pageTitles[location.pathname] ?? 'Drehpunkt'

  return (
    <div className={`app-shell ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar collapsed={isSidebarCollapsed} onToggle={() => setSidebarCollapsed((value) => !value)} />
      <div className="content-frame">
        <Header title={title} />
        <main className="app-content">{children}</main>
      </div>
    </div>
  )
}
