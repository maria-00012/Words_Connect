import { useEffect, useState } from 'react';
import { ArrowLeft, BadgeCheck, CircleUserRound, Mail, Save, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { Button, Card, Chip, PageTitle } from '../../components/ui.jsx';

export function ProfilePage() {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [notice, setNotice] = useState('');
  useEffect(() => { setName(user.name); setEmail(user.email); }, [user]);
  const save = (event) => {
    event.preventDefault();
    if (name.trim().length < 2) { setNotice('Enter a name with at least 2 characters.'); return; }
    const result = updateProfile({ name: name.trim(), email: email.trim().toLowerCase() });
    setNotice(result.error || 'Profile updated on this device.');
  };
  return <div className="profile-view"><PageTitle eyebrow="YOUR ACCOUNT" title="My profile" description="Keep your personal details up to date." action={<Link to={`/${user.role}`} className="text-link"><ArrowLeft size={15} /> Back to dashboard</Link>} /><div className="profile-grid"><Card className="profile-summary"><span className="profile-avatar">{user.name[0]}</span><h2>{user.name}</h2><p>{user.email}</p><Chip><BadgeCheck size={14} /> {user.role}</Chip><div className="profile-detail"><Shield size={16} /><span>Account type<b>{user.role[0].toUpperCase() + user.role.slice(1)}</b></span></div><div className="profile-detail"><CircleUserRound size={16} /><span>Account status<b>{user.status}</b></span></div></Card><Card><h2>Personal information</h2><p className="muted">These changes are stored in mock account state only.</p><form className="profile-form" onSubmit={save}><label className="field">Full name<input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} autoComplete="name" /></label><label className="field">Email address<div className="input-with-icon"><Mail size={17} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></div></label><label className="field">Role<input value={user.role} readOnly /></label><div className="profile-actions"><Button variant="lime"><Save size={16} /> Save changes</Button>{notice && <span className="status-message" role="status">{notice}</span>}</div></form></Card></div><Card className="account-note"><h3>Account security</h3><p>Password changes and verified email management will be handled by the backend account service in a later phase.</p></Card></div>;
}
