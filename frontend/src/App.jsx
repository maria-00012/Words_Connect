import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { AuthLayout, AdminLayout, StudentLayout, TeacherLayout } from './layouts/AppLayouts.jsx';
import { AccountReadyPage, LoginPage, RegisterPage, TeacherInvitePage } from './features/auth/AuthPages.jsx';
import { BootstrapAdminPage } from './features/auth/BootstrapAdminPage.jsx';
import { StudentDashboard } from './features/student/StudentDashboard.jsx';
import { TeacherDashboard } from './features/teacher/TeacherDashboard.jsx';
import { AdminDashboard } from './features/admin/AdminDashboard.jsx';
import { ProfilePage } from './features/profile/ProfilePage.jsx';

function Guard({ roles, children }) {
  const { user, ready } = useAuth();
  if (!ready) return <div className="page-loading" role="status">Loading your account…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={`/${user.role}`} replace />;
  return children;
}

export default function App() {
  const { user, ready } = useAuth();
  const home = user ? `/${user.role}` : '/login';
  if (!ready) return <div className="page-loading" role="status">Loading your account…</div>;
  return <Routes>
    <Route element={<AuthLayout />}>
      <Route path="/" element={<Navigate to={home} replace />} />
      <Route path="/login" element={user ? <Navigate to={`/${user.role}`} replace /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to={`/${user.role}`} replace /> : <RegisterPage />} />
      <Route path="/invite/teacher" element={user ? <Navigate to={`/${user.role}`} replace /> : <TeacherInvitePage />} />
      <Route path="/account-ready" element={<AccountReadyPage />} />
      <Route path="/bootstrap-admin" element={<BootstrapAdminPage />} />
    </Route>
    <Route path="/student" element={<Guard roles={['student']}><StudentLayout /></Guard>}><Route index element={<StudentDashboard />} /><Route path="profile" element={<ProfilePage />} /></Route>
    <Route path="/teacher" element={<Guard roles={['teacher']}><TeacherLayout /></Guard>}><Route index element={<TeacherDashboard />} /><Route path="profile" element={<ProfilePage />} /></Route>
    <Route path="/admin" element={<Guard roles={['admin']}><AdminLayout /></Guard>}><Route index element={<AdminDashboard />} /><Route path="profile" element={<ProfilePage />} /></Route>
    <Route path="*" element={<Navigate to={home} replace />} />
  </Routes>;
}
