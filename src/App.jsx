import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/layout/AppShell.jsx'
import BusinessPartnerFormPage from './pages/BusinessPartnerFormPage.jsx'
import CustomersPage from './pages/CustomersPage.jsx'
import CrmDetailPage from './pages/CrmDetailPage.jsx'
import CrmPage from './pages/CrmPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import PalletAccountDetailPage from './pages/PalletAccountDetailPage.jsx'
import PalletsPage from './pages/PalletsPage.jsx'
import TodosPage from './pages/TodosPage.jsx'
import NewsPage from './pages/NewsPage.jsx'
import DocumentsPage from './pages/DocumentsPage.jsx'

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/kunden-unternehmer" element={<CustomersPage />} />
        <Route path="/kunden-unternehmer/neu" element={<BusinessPartnerFormPage mode="create" />} />
        <Route path="/kunden-unternehmer/:partnerId" element={<BusinessPartnerFormPage mode="existing" />} />
        <Route path="/kunden-unternehmer/:partnerId/bearbeiten" element={<Navigate to="/kunden-unternehmer" replace />} />
        <Route path="/crm" element={<CrmPage />} />
        <Route path="/crm/:partnerId" element={<CrmDetailPage />} />
        <Route path="/paletten" element={<PalletsPage />} />
        <Route path="/paletten/:partnerId" element={<PalletAccountDetailPage />} />
        <Route path="/news" element={<NewsPage />} />
        <Route path="/dokumente" element={<DocumentsPage />} />
        <Route path="/todos" element={<TodosPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppShell>
  )
}
