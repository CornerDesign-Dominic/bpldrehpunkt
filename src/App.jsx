import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/layout/AppShell.jsx'
import BusinessPartnerDetailPage from './pages/BusinessPartnerDetailPage.jsx'
import BusinessPartnerFormPage from './pages/BusinessPartnerFormPage.jsx'
import CustomersPage from './pages/CustomersPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/kunden-unternehmer" element={<CustomersPage />} />
        <Route path="/kunden-unternehmer/neu" element={<BusinessPartnerFormPage mode="create" />} />
        <Route path="/kunden-unternehmer/:partnerId" element={<BusinessPartnerDetailPage />} />
        <Route path="/kunden-unternehmer/:partnerId/bearbeiten" element={<BusinessPartnerFormPage mode="edit" />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppShell>
  )
}
