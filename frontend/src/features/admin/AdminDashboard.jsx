import { useState } from 'react';
import { Clipboard, MailPlus, ShieldCheck, UserCheck, UserRoundCog, UsersRound, XCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useData } from '../../context/DataContext.jsx';
import { Button, Card, Chip, EmptyState, Field, Metric, PageTitle } from '../../components/ui.jsx';
import { createId, teacherInviteUrl } from '../../services/mockApi.js';

export function AdminDashboard() {
  const { users, setUsers } = useAuth();
  const { data, addInvite, setData } = useData();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [createdInvite, setCreatedInvite] = useState(null);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const teachers = users.filter((user) => user.role === 'teacher');
  const students = users.filter((user) => user.role === 'student');
  const teacherInvites = data.invites.filter((invite) => invite.type === 'teacher');

  const inviteTeacher = (event) => {
    event.preventDefault(); setMessage(''); setCreatedInvite(null);
    const normalized = email.trim().toLowerCase();
    if (users.some((user) => user.email.toLowerCase() === normalized) || teacherInvites.some((invite) => invite.email.toLowerCase() === normalized && invite.status === 'Pending')) {
      setMessage('An account or pending invitation already exists for this email.'); return;
    }
    const invite = { token: createId('teacher-invite'), type: 'teacher', email: normalized, name: name.trim(), status: 'Pending', expiresAt: Date.now() + 7 * 86400000 };
    addInvite(invite); setCreatedInvite(invite); setEmail(''); setName('');
  };
  const copyInvite = async () => {
    try { await navigator.clipboard.writeText(teacherInviteUrl(createdInvite.token)); setCopied(true); }
    catch { setCopied(false); setMessage('Select the invitation link and copy it manually.'); }
  };
  const setStatus = (id, status) => setUsers((current) => current.map((user) => user.id === id ? { ...user, status } : user));
  const revokeInvite = (token) => setData((current) => ({ ...current, invites: current.invites.map((invite) => invite.token === token ? { ...invite, status: 'Revoked' } : invite) }));

  return <div className="admin-view"><PageTitle eyebrow="PLATFORM ADMINISTRATION" title="People & invitations" description="Manage access to Words Connect. New teacher accounts are invitation-only." action={<Chip><ShieldCheck size={14} /> Admin access</Chip>} />
    <div className="metrics-grid admin-metrics"><Metric value={users.length} label="Platform users" icon={UsersRound} /><Metric value={teachers.length} label="Teachers" icon={UserRoundCog} /><Metric value={students.length} label="Students" icon={UserCheck} /><Metric value={teacherInvites.filter((invite) => invite.status === 'Pending').length} label="Pending invites" icon={MailPlus} /></div>
    <div className="admin-grid"><Card><div className="section-heading"><div><h2>Invite a teacher</h2><p className="muted">Teacher access is created by an administrator.</p></div><span className="auth-icon"><MailPlus size={20} /></span></div><form className="admin-invite-form" onSubmit={inviteTeacher}><Field label="Teacher name" id="invite-name" placeholder="Optional name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} /><Field label="Teacher email" id="invite-email" type="email" placeholder="teacher@school.edu" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /><Button><MailPlus size={16} /> Create invitation</Button></form>{message && <p className="status-message" role="status">{message}</p>}{createdInvite && <div className="generated-invite"><div className="invite-ok"><ShieldCheck size={18} /> Invitation ready for <b>{createdInvite.email}</b></div><label className="field">Invitation link<input readOnly value={teacherInviteUrl(createdInvite.token)} onFocus={(event) => event.target.select()} /></label><Button variant="secondary" onClick={copyInvite}><Clipboard size={16} /> {copied ? 'Copied' : 'Copy invitation link'}</Button><p className="fine-print">Expires in 7 days. This is a mock invitation; no email was sent.</p></div>}</Card>
      <Card><h2>Account access</h2><p className="muted">Suspend demo access or restore it. Role changes are not available here.</p><div className="admin-user-list">{users.map((user) => <div className="admin-user-row" key={user.id}><span className="avatar">{user.name[0]}</span><div><b>{user.name}</b><span>{user.email}</span></div><Chip className={user.status === 'Suspended' ? 'chip-danger' : ''}>{user.status}</Chip>{user.role !== 'admin' && <button className="admin-suspend" aria-label={user.status === 'Suspended' ? `Restore ${user.name}` : `Suspend ${user.name}`} onClick={() => setStatus(user.id, user.status === 'Suspended' ? 'Active' : 'Suspended')}>{user.status === 'Suspended' ? <UserCheck size={17} /> : <XCircle size={17} />}</button>}</div>)}</div></Card>
    </div>
    <Card><div className="section-heading"><div><h2>Teacher invitations</h2><p className="muted">Invitation links are single-use in the intended backend flow. In this mock stage they are not securely consumed.</p></div><Chip>{teacherInvites.length}</Chip></div>{teacherInvites.length ? <div className="invite-table">{teacherInvites.map((invite) => <div className="invite-row" key={invite.token}><div><b>{invite.email}</b><span>{invite.name || 'Teacher invitation'} · expires {new Date(invite.expiresAt).toLocaleDateString()}</span></div><Chip className={invite.status === 'Pending' ? 'chip-pending' : ''}>{invite.status}</Chip>{invite.status === 'Pending' && <button className="admin-suspend" aria-label={`Revoke invitation for ${invite.email}`} onClick={() => revokeInvite(invite.token)}><XCircle size={17} /></button>}</div>)}</div> : <EmptyState title="No teacher invitations yet." />}</Card>
  </div>;
}
