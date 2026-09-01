import { useState } from 'react'
import Header from './Header.jsx'
import Sidebar from './Sidebar.jsx'
import { useTheme } from '../../theme/useTheme.js'

export default function AppShell({ children }) {
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false)
  const { theme, toggleTheme } = useTheme()

  return (
    <div className={`app-shell ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar collapsed={isSidebarCollapsed} onToggle={() => setSidebarCollapsed((value) => !value)} theme={theme} onThemeToggle={toggleTheme} />
      <div className="content-frame">
        <Header />
        <main className="app-content">{children}</main>
      </div>
    </div>
  )
}
