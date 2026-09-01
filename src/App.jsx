import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/layout/AppShell.jsx'
import BusinessPartnerFormPage from './pages/BusinessPartnerFormPage.jsx'
import CustomersPage from './pages/CustomersPage.jsx'
import CrmDetailPage from './pages/CrmDetailPage.jsx'
import CrmPage from './pages/CrmPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import PalletAccountDetailPage from './pages/PalletAccountDetailPage.jsx'
import PalletsPage from './pages/PalletsPage.jsx'
import CaseDetailPage from './pages/CaseDetailPage.jsx'
import CaseListPage from './pages/CaseListPage.jsx'

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
        <Route path="/rechtsfaelle" element={<CaseListPage moduleKey="legal" />} />
        <Route path="/rechtsfaelle/neu" element={<CaseDetailPage moduleKey="legal" mode="create" />} />
        <Route path="/rechtsfaelle/:caseId" element={<CaseDetailPage moduleKey="legal" mode="existing" />} />
        <Route path="/inkassofaelle" element={<CaseListPage moduleKey="debtCollection" />} />
        <Route path="/inkassofaelle/neu" element={<CaseDetailPage moduleKey="debtCollection" mode="create" />} />
        <Route path="/inkassofaelle/:caseId" element={<CaseDetailPage moduleKey="debtCollection" mode="existing" />} />
        <Route path="/versicherungsfaelle" element={<CaseListPage moduleKey="insurance" />} />
        <Route path="/versicherungsfaelle/neu" element={<CaseDetailPage moduleKey="insurance" mode="create" />} />
        <Route path="/versicherungsfaelle/:caseId" element={<CaseDetailPage moduleKey="insurance" mode="existing" />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppShell>
  )
}
