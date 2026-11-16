import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clipboard, MailPlus, RefreshCw, ShieldCheck, UserCheck, UserRoundCog, UsersRound, XCircle } from 'lucide-react';
import { Button, Card, Chip, EmptyState, Field, Metric, PageTitle } from '../../components/ui.jsx';
import { teacherInviteUrl } from '../../services/mockApi.js';
import { createTeacherInvitation, loadPeopleAndInvitations, revokeTeacherInvitation, setPlatformUserStatus } from './adminService.js';

function displayStatus(user) {
  if (user.status === 'active') return 'Active';
  if (user.status === 'suspended') return 'Suspended';
  return 'Pending';
}

function invitationStatus(invite, now) {
  if (invite.status === 'pending' && new Date(invite.expires_at).getTime() <= now) return 'Expired';
  if (invite.status === 'consumed') return 'Accepted';
  return invite.status.charAt(0).toUpperCase() + invite.status.slice(1);
}

export function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [teacherInvites, setTeacherInvites] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [loadError, setLoadError] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [createdInvite, setCreatedInvite] = useState(null);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    setLoadingData(true);
    setLoadError('');
    try {
      const result = await loadPeopleAndInvitations();
      setUsers(result.users);
      setTeacherInvites(result.invitations);
    } catch (error) {
      setLoadError(error.message || 'Unable to load platform people and invitations.');
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const teachers = useMemo(() => users.filter((user) => user.role === 'teacher'), [users]);
  const students = useMemo(() => users.filter((user) => user.role === 'student'), [users]);
  const pendingInviteCount = useMemo(() => {
    return teacherInvites.filter((invite) => invite.status === 'pending' && new Date(invite.expires_at).getTime() > now).length;
  }, [teacherInvites, now]);

  const inviteTeacher = async (event) => {
    event.preventDefault();
    setMessage('');
    setCreatedInvite(null);
    const normalized = email.trim().toLowerCase();
    const pending = teacherInvites.some((invite) => invite.email?.toLowerCase() === normalized
      && invite.status === 'pending' && new Date(invite.expires_at).getTime() > Date.now());
    if (users.some((user) => user.email.toLowerCase() === normalized) || pending) {
      setMessage('An account or pending invitation already exists for this email.');
      return;
    }

    setBusy(true);
    try {
      const invite = await createTeacherInvitation(normalized);
      setCreatedInvite({ ...invite, name: name.trim() });
      setEmail('');
      setName('');
      setCopied(false);
      await refresh();
    } catch (error) {
      setMessage(error.message || 'The teacher invitation could not be created.');
    } finally {
      setBusy(false);
    }
  };

  const copyInvite = async () => {
    if (!createdInvite) return;
    try {
      await navigator.clipboard.writeText(teacherInviteUrl(createdInvite.token));
      setCopied(true);
      setMessage('Invitation link copied. Share it with the invited teacher; it is only shown here once.');
    } catch {
      setCopied(false);
      setMessage('Clipboard access is unavailable. Select the invitation link and copy it manually.');
    }
  };

  const changeStatus = async (user) => {
    const nextStatus = user.status === 'suspended' ? 'active' : 'suspended';
    setBusy(true);
    setMessage('');
    try {
      await setPlatformUserStatus(user.id, nextStatus);
      await refresh();
    } catch (error) {
      setMessage(error.message || 'The account status could not be changed.');
    } finally {
      setBusy(false);
    }
  };

  const revokeInvite = async (invite) => {
    setBusy(true);
    setMessage('');
    try {
      await revokeTeacherInvitation(invite.id);
      await refresh();
    } catch (error) {
      setMessage(error.message || 'The invitation could not be revoked.');
    } finally {
      setBusy(false);
    }
  };

  return <div className="admin-view"><PageTitle eyebrow="PLATFORM ADMINISTRATION" title="People & invitations" description="Manage access to Words Connect. New teacher accounts are invitation-only." action={<Chip><ShieldCheck size={14} /> Admin access</Chip>} />
    <div className="metrics-grid admin-metrics"><Metric value={users.length} label="Platform users" icon={UsersRound} /><Metric value={teachers.length} label="Teachers" icon={UserRoundCog} /><Metric value={students.length} label="Students" icon={UserCheck} /><Metric value={pendingInviteCount} label="Pending invites" icon={MailPlus} /></div>
    <div className="admin-grid"><Card><div className="section-heading"><div><h2>Invite a teacher</h2><p className="muted">Teacher access is created by an administrator.</p></div><span className="auth-icon"><MailPlus size={20} /></span></div><form className="admin-invite-form" onSubmit={inviteTeacher}><Field label="Teacher name" id="invite-name" hint="shown on this screen only; account name is set at signup" placeholder="Teacher name" autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} /><Field label="Teacher email" id="invite-email" type="email" placeholder="teacher@school.edu" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /><Button disabled={busy}><MailPlus size={16} /> Create invitation</Button></form>{message && <p className="status-message" role="status">{message}</p>}{createdInvite && <div className="generated-invite"><div className="invite-ok"><ShieldCheck size={18} /> Invitation ready for <b>{createdInvite.name ? `${createdInvite.name} (${createdInvite.email})` : createdInvite.email}</b></div><label className="field">Invitation link<input aria-label="Invitation link" readOnly value={teacherInviteUrl(createdInvite.token)} onFocus={(event) => event.target.select()} /></label><Button variant="secondary" onClick={copyInvite}><Clipboard size={16} /> {copied ? 'Copied' : 'Copy invitation link'}</Button><p className="fine-print">Expires {new Date(createdInvite.expiresAt).toLocaleString()}. Share this one-time link manually; the database stores only its token hash.</p></div>}</Card>
      <Card><div className="section-heading"><div><h2>Account access</h2><p className="muted">Suspend or restore accounts. Role changes are not available here.</p></div><Button variant="secondary" className="admin-refresh" onClick={refresh} disabled={loadingData || busy} aria-label="Refresh people"><RefreshCw size={16} /></Button></div>{loadingData ? <EmptyState title="Loading platform users…" /> : loadError ? <div className="alert-error" role="alert">{loadError}</div> : users.length ? <div className="admin-user-list">{users.map((user) => { const label = user.display_name?.trim() || user.email; const status = displayStatus(user); return <div className="admin-user-row" key={user.id}><span className="avatar">{label[0]?.toUpperCase() || '?'}</span><div><b>{label}</b><span>{user.email} · {user.role}</span></div><Chip className={user.status === 'suspended' ? 'chip-danger' : user.status === 'pending' ? 'chip-pending' : ''}>{status}</Chip>{user.role !== 'admin' && user.status !== 'pending' && <button className="admin-suspend" aria-label={user.status === 'suspended' ? `Restore ${label}` : `Suspend ${label}`} disabled={busy} onClick={() => changeStatus(user)}>{user.status === 'suspended' ? <UserCheck size={17} /> : <XCircle size={17} />}</button>}</div>; })}</div> : <EmptyState title="No platform profiles found." />}</Card>
    </div>
    <Card><div className="section-heading"><div><h2>Teacher invitations</h2><p className="muted">Teacher invitations are single-use and validated by the database.</p></div><div className="section-heading-actions"><Button variant="secondary" onClick={refresh} disabled={loadingData || busy}>Refresh</Button><Chip>{teacherInvites.length}</Chip></div></div>{loadingData ? <EmptyState title="Loading teacher invitations…" /> : loadError ? <div className="alert-error" role="alert">{loadError}</div> : teacherInvites.length ? <div className="invite-table">{teacherInvites.map((invite) => { const status = invitationStatus(invite, now); const pending = invite.status === 'pending' && status !== 'Expired'; const expiry = `expires ${new Date(invite.expires_at).toLocaleDateString()}`; return <div className="invite-row" key={invite.id}><div><b>{invite.email}</b><span>{status === 'Accepted' ? `Accepted ${invite.consumed_at ? new Date(invite.consumed_at).toLocaleDateString() : ''} · ${expiry}` : `Created ${new Date(invite.created_at).toLocaleDateString()} · ${expiry}`}</span></div><Chip className={pending ? 'chip-pending' : status === 'Expired' || status === 'Revoked' ? 'chip-danger' : ''}>{status}</Chip>{pending && <button className="admin-suspend" aria-label={`Revoke invitation for ${invite.email}`} disabled={busy} onClick={() => revokeInvite(invite)}><XCircle size={17} /></button>}</div>; })}</div> : <EmptyState title="No teacher invitations yet." />}</Card>
  </div>;
}
