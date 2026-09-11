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
import TodoDetailPage from './pages/TodoDetailPage.jsx'
import DamagesPage from './pages/DamagesPage.jsx'
import DamageDetailPage from './pages/DamageDetailPage.jsx'
import NewsPage from './pages/NewsPage.jsx'
import DocumentsPage from './pages/DocumentsPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import ProfilePage from './pages/ProfilePage.jsx'
import TeamPage from './pages/TeamPage.jsx'
import AdminPage from './pages/AdminPage.jsx'
import VacationPage from './pages/VacationPage.jsx'
import VacationManagementPage from './pages/VacationManagementPage.jsx'
import CalendarPage from './pages/CalendarPage.jsx'
import SystemMailsPage from './pages/SystemMailsPage.jsx'
import AiPromptsPage from './pages/AiPromptsPage.jsx'
import TemplatesOverviewPage from './pages/TemplatesOverviewPage.jsx'
import LiabilityLetterPage from './pages/LiabilityLetterPage.jsx'
import BusinessDocumentPage from './pages/BusinessDocumentPage.jsx'
import PersonnelPage from './pages/PersonnelPage.jsx'
import PersonnelDetailPage from './pages/PersonnelDetailPage.jsx'
import PersonnelVacationPage from './pages/PersonnelVacationPage.jsx'
import KnowledgeProcessesPage from './pages/KnowledgeProcessesPage.jsx'
import KnowledgeProcessPage from './pages/KnowledgeProcessPage.jsx'
import InsolvenciesPage from './pages/InsolvenciesPage.jsx'
import InsolvencyDetailPage from './pages/InsolvencyDetailPage.jsx'
import LegalDisputesPage from './pages/LegalDisputesPage.jsx'
import LegalDisputeDetailPage from './pages/LegalDisputeDetailPage.jsx'
import InkassoPage from './pages/InkassoPage.jsx'
import InkassoCaseDetailPage from './pages/InkassoCaseDetailPage.jsx'
import AgbCheckerPage from './pages/AgbCheckerPage.jsx'
import { PartnerEvaluationSettingsProvider } from './partner-evaluation/PartnerEvaluationSettingsProvider.jsx'

function ProtectedAppLayout() {
  return <ProtectedRoute><PartnerEvaluationSettingsProvider><AppShell><Outlet /></AppShell></PartnerEvaluationSettingsProvider></ProtectedRoute>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
      <Route element={<ProtectedAppLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/team" element={<PermissionRoute module="team"><TeamPage /></PermissionRoute>} />
        <Route path="/personal" element={<PermissionRoute module="personnel"><PersonnelPage /></PermissionRoute>} />
        <Route path="/personal/urlaub" element={<PermissionRoute module="personnel"><PersonnelVacationPage /></PermissionRoute>} />
        <Route path="/personal/:userId" element={<PermissionRoute module="personnel"><PersonnelDetailPage /></PermissionRoute>} />
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
        <Route path="/vorlagen" element={<PermissionRoute module="templates"><TemplatesOverviewPage /></PermissionRoute>} />
        <Route path="/vorlagen/haftbarhaltung" element={<PermissionRoute module="templates"><LiabilityLetterPage /></PermissionRoute>} />
        <Route path="/vorlagen/geschaeftsdokument" element={<PermissionRoute module="templates"><BusinessDocumentPage /></PermissionRoute>} />
        <Route path="/wissen-prozesse" element={<PermissionRoute module="knowledgeProcesses"><KnowledgeProcessesPage /></PermissionRoute>} />
        <Route path="/wissen-prozesse/neu" element={<PermissionRoute module="knowledgeProcesses"><KnowledgeProcessPage isNew /></PermissionRoute>} />
        <Route path="/wissen-prozesse/:processId" element={<PermissionRoute module="knowledgeProcesses"><KnowledgeProcessPage /></PermissionRoute>} />
        <Route path="/todos" element={<PermissionRoute module="todos"><TodosPage /></PermissionRoute>} />
        <Route path="/todos/:todoId" element={<PermissionRoute module="todos"><TodoDetailPage /></PermissionRoute>} />
        <Route path="/schaeden" element={<PermissionRoute module="damages"><DamagesPage /></PermissionRoute>} />
        <Route path="/schaeden/:damageCaseId" element={<PermissionRoute module="damages"><DamageDetailPage /></PermissionRoute>} />
        <Route path="/insolvenzen" element={<PermissionRoute module="insolvencies"><InsolvenciesPage /></PermissionRoute>} />
        <Route path="/insolvenzen/:partnerId" element={<PermissionRoute module="insolvencies"><InsolvencyDetailPage /></PermissionRoute>} />
        <Route path="/legal-disputes" element={<PermissionRoute module="legalDisputes"><LegalDisputesPage /></PermissionRoute>} />
        <Route path="/legal-disputes/:legalDisputeId" element={<PermissionRoute module="legalDisputes"><LegalDisputeDetailPage /></PermissionRoute>} />
        <Route path="/inkasso" element={<PermissionRoute module="inkasso"><InkassoPage /></PermissionRoute>} />
        <Route path="/inkasso/:caseId" element={<PermissionRoute module="inkasso"><InkassoCaseDetailPage /></PermissionRoute>} />
        <Route path="/agb-pruefer" element={<PermissionRoute module="agbChecker"><AgbCheckerPage /></PermissionRoute>} />
        <Route path="/profil" element={<ProfilePage />} />
        <Route path="/admin" element={<PermissionRoute requireUserManagement><AdminPage /></PermissionRoute>} />
        <Route path="/admin/systemmails" element={<PermissionRoute requireSuperadmin><SystemMailsPage /></PermissionRoute>} />
        <Route path="/admin/ki-prompts" element={<PermissionRoute requireSuperadmin><AiPromptsPage /></PermissionRoute>} />
        <Route path="/urlaub" element={<PermissionRoute module="vacation"><VacationPage /></PermissionRoute>} />
        <Route path="/kalender" element={<PermissionRoute module="calendar"><CalendarPage /></PermissionRoute>} />
        <Route path="/urlaubsmanagement" element={<PermissionRoute requireVacationManagement><VacationManagementPage /></PermissionRoute>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  )
}
