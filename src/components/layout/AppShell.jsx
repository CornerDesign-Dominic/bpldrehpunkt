import { useState } from 'react'
import Header from './Header.jsx'
import Sidebar from './Sidebar.jsx'
import BugReportButton from '../bug-reports/BugReportButton.jsx'
import { PageHeaderContext } from '../../lib/pageHeader.js'

export default function AppShell({ children }) {
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [pageTitle, setPageTitle] = useState('')

  return (
    <PageHeaderContext.Provider value={{ pageTitle, setTitle: setPageTitle }}>
    <div className={`app-shell ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar collapsed={isSidebarCollapsed} onToggle={() => setSidebarCollapsed((value) => !value)} />
      <div className="content-frame">
        <Header />
        <main className="app-content">{children}</main>
      </div>
      <BugReportButton />
    </div>
    </PageHeaderContext.Provider>
  )
}
