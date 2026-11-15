import { Outlet, Link, NavLink, useNavigate } from 'react-router-dom';
import { BookOpen, CircleUserRound, LogOut, ShieldCheck, Sparkles, UsersRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

export function AuthLayout() {
  return <div className="auth-page"><header className="topbar auth-topbar"><Link to="/login" className="brand"><span className="brand-mark">W</span><span>WORDS CONNECT<small>Fluent Spring</small></span></Link><span className="auth-top-note">Reading & writing · paraphrasing</span></header><Outlet /></div>;
}

function WorkspaceLayout({ role, children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const base = `/${role}`;
  const labels = { student: 'Student space', teacher: 'Teacher dashboard', admin: 'Platform admin' };
  const Icon = role === 'admin' ? ShieldCheck : role === 'teacher' ? UsersRound : BookOpen;
  return <div className={`workspace ${role}-workspace`}>
    <header className="topbar workspace-topbar"><Link to={base} className="brand"><span className="brand-mark">W</span><span>WORDS CONNECT<small>{labels[role]}</small></span></Link>
      <div className="topbar-actions"><span className="topbar-user"><span className="avatar">{user?.name?.[0]}</span><span className="topbar-user-name">{user?.name}<small>{role}</small></span></span><Link className="icon-link" to={`${base}/profile`} aria-label="Profile"><CircleUserRound size={19} /></Link><button className="icon-link" onClick={() => { logout(); navigate('/login'); }} aria-label="Log out"><LogOut size={19} /></button></div>
    </header>
    <div className="workspace-body"><aside className="side-rail"><div className="side-label"><Icon size={15} /> {labels[role]}</div><nav className="side-nav">
      {role === 'student' && <NavLink to={base}><BookOpen size={18} /> My learning</NavLink>}
      {role === 'teacher' && <NavLink to={base}><UsersRound size={18} /> My classroom</NavLink>}
      {role === 'admin' && <NavLink to={base}><ShieldCheck size={18} /> Overview</NavLink>}
      <NavLink to={`${base}/profile`}><CircleUserRound size={18} /> My profile</NavLink>
    </nav><div className="rail-note"><Sparkles size={16} /><span>Same idea.<br />New expression.</span></div></aside>
      <main className="workspace-main">{children}</main>
    </div>
  </div>;
}

export function StudentLayout() { return <WorkspaceLayout role="student"><Outlet /></WorkspaceLayout>; }
export function TeacherLayout() { return <WorkspaceLayout role="teacher"><Outlet /></WorkspaceLayout>; }
export function AdminLayout() { return <WorkspaceLayout role="admin"><Outlet /></WorkspaceLayout>; }
