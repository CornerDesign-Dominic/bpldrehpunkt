import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './auth/ProtectedRoute.jsx'
import PermissionRoute from './auth/PermissionRoute.jsx'
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
import VacationManagementPage from './pages/VacationManagementPage.jsx'
import CalendarPage from './pages/CalendarPage.jsx'

function ProtectedAppLayout() {
  return <ProtectedRoute><AppShell><Outlet /></AppShell></ProtectedRoute>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
      <Route element={<ProtectedAppLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/team" element={<PermissionRoute module="team"><TeamPage /></PermissionRoute>} />
        <Route path="/kunden-unternehmer" element={<PermissionRoute module="masterData"><CustomersPage /></PermissionRoute>} />
        <Route path="/kunden-unternehmer/neu" element={<PermissionRoute module="masterData"><BusinessPartnerFormPage mode="create" /></PermissionRoute>} />
        <Route path="/kunden-unternehmer/:partnerId" element={<PermissionRoute module="masterData"><BusinessPartnerFormPage mode="existing" /></PermissionRoute>} />
        <Route path="/kunden-unternehmer/:partnerId/bearbeiten" element={<Navigate to="/kunden-unternehmer" replace />} />
        <Route path="/crm" element={<PermissionRoute module="crm"><CrmPage /></PermissionRoute>} />
        <Route path="/crm/:partnerId" element={<PermissionRoute module="crm"><CrmDetailPage /></PermissionRoute>} />
        <Route path="/paletten" element={<PermissionRoute module="pallets"><PalletsPage /></PermissionRoute>} />
        <Route path="/paletten/:partnerId" element={<PermissionRoute module="pallets"><PalletAccountDetailPage /></PermissionRoute>} />
        <Route path="/news" element={<PermissionRoute module="news"><NewsPage /></PermissionRoute>} />
        <Route path="/dokumente" element={<PermissionRoute module="documents"><DocumentsPage /></PermissionRoute>} />
        <Route path="/todos" element={<PermissionRoute module="todos"><TodosPage /></PermissionRoute>} />
        <Route path="/profil" element={<ProfilePage />} />
        <Route path="/admin" element={<PermissionRoute requireUserManagement><AdminPage /></PermissionRoute>} />
        <Route path="/urlaub" element={<PermissionRoute module="vacation"><VacationPage /></PermissionRoute>} />
        <Route path="/kalender" element={<PermissionRoute module="calendar"><CalendarPage /></PermissionRoute>} />
        <Route path="/urlaubsmanagement" element={<PermissionRoute requireVacationManagement><VacationManagementPage /></PermissionRoute>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  )
}
