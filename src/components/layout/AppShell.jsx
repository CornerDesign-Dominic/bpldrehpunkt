import { useState } from 'react'
import Header from './Header.jsx'
import Sidebar from './Sidebar.jsx'

export default function AppShell({ children }) {
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <div className={`app-shell ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar collapsed={isSidebarCollapsed} onToggle={() => setSidebarCollapsed((value) => !value)} />
      <div className="content-frame">
        <Header />
        <main className="app-content">{children}</main>
      </div>
    </div>
  )
}
