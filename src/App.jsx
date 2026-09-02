import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './auth/ProtectedRoute.jsx'
import PublicOnlyRoute from './auth/PublicOnlyRoute.jsx'
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
import LoginPage from './pages/LoginPage.jsx'
import ProfilePage from './pages/ProfilePage.jsx'
import TeamPage from './pages/TeamPage.jsx'
import AdminPage from './pages/AdminPage.jsx'
import VacationPage from './pages/VacationPage.jsx'

function ProtectedAppLayout() {
  return <ProtectedRoute><AppShell><Outlet /></AppShell></ProtectedRoute>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
      <Route element={<ProtectedAppLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/team" element={<TeamPage />} />
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
        <Route path="/profil" element={<ProfilePage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/urlaub" element={<VacationPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  )
}
