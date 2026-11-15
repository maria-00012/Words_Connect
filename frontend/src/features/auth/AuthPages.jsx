import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, BookOpenCheck, Eye, EyeOff, GraduationCap, KeyRound, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useData } from '../../context/DataContext.jsx';
import { DEMO_PASSWORD } from '../../app/mockSeed.js';
import { Button, Card } from '../../components/ui.jsx';

function AuthIntro({ eyebrow = 'A CLASSROOM FOR IDEAS', title, children }) {
  return <div className="auth-intro"><span className="intro-orbit orbit-one" /><span className="intro-orbit orbit-two" /><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{children}<div className="auth-promise"><span>01</span> Understand the idea <i /> <span>02</span> Make it yours</div></div>;
}

function PasswordField({ value, onChange, id = 'password', label = 'Password' }) {
  const [visible, setVisible] = useState(false);
  return <label className="auth-field" htmlFor={id}><span>{label}</span><div className="input-wrap"><KeyRound size={17} /><input id={id} type={visible ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={label === 'Password' ? 'current-password' : 'new-password'} required minLength={8} placeholder="At least 8 characters" /><button type="button" className="password-toggle" aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>;
}

export function LoginPage() {
  const { login, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault(); setError('');
    try { const user = await login(email, password); navigate(`/${user.role}`); }
    catch (cause) { setError(cause.message); }
  };
  return <div className="auth-grid"><AuthIntro title={<>Same idea.<br /><em>New expression.</em></>}><p>Find your words, share your thinking, and grow as a writer.</p></AuthIntro>
    <Card className="auth-card"><div className="auth-card-heading"><span className="auth-icon"><BookOpenCheck size={22} /></span><p className="eyebrow">WELCOME BACK</p><h2>Log in to your class</h2><p className="muted">Pick up where your ideas left off.</p></div>
      <form onSubmit={submit} className="auth-form"><label className="auth-field" htmlFor="email"><span>Email address</span><div className="input-wrap"><Mail size={17} /><input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></div></label><PasswordField value={password} onChange={(event) => setPassword(event.target.value)} />
        {error && <div className="alert-error" role="alert">{error}</div>}<Button className="full-width" disabled={loading}>{loading ? 'Opening your class…' : <>Log in <ArrowRight size={17} /></>}</Button>
      </form>
      <div className="auth-divider"><span>NEW TO WORDS CONNECT?</span></div><p className="auth-foot">Students can register with a classroom invitation. Teachers need an invitation from an administrator.</p><Link className="text-link" to="/register">I have a classroom invitation <ArrowRight size={15} /></Link>
      <details className="demo-access"><summary>Preview with a demo account</summary><div className="demo-accounts">{[['Student','student@wordsconnect.demo'],['Teacher','teacher@wordsconnect.demo'],['Admin','admin@wordsconnect.demo']].map(([label, value]) => <button type="button" key={label} onClick={() => { setEmail(value); setPassword(DEMO_PASSWORD); }}>{label}<span>{value}</span></button>)}</div><small>Demo password: <b>{DEMO_PASSWORD}</b></small></details>
    </Card></div>;
}

function invitationFromQuery(searchParams, invites) {
  const token = searchParams.get('invite');
  if (!token) return null;
  return invites.find((invite) => invite.token === token && invite.type === 'student' && invite.status === 'Active' && invite.expiresAt > Date.now()) || null;
}

export function RegisterPage() {
  const [params] = useSearchParams();
  const { data } = useData();
  const invite = useMemo(() => invitationFromQuery(params, data.invites), [params, data.invites]);
  const { register, loading } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault(); setError('');
    if (!invite) { setError('This classroom invitation is invalid, expired, or already used. Ask your teacher for a new QR code.'); return; }
    if (form.password !== form.confirm) { setError('Your passwords do not match.'); return; }
    try { const user = await register({ ...form, role: 'student', invite }); navigate(`/${user.role}`); }
    catch (cause) { setError(cause.message); }
  };
  return <div className="auth-grid"><AuthIntro eyebrow="JOIN A CLASSROOM" title={<>Your next idea<br /><em>starts here.</em></>}><p>Scan your teacher’s classroom QR code to join the learning community.</p></AuthIntro><Card className="auth-card"><div className="auth-card-heading"><span className="auth-icon"><GraduationCap size={22} /></span><p className="eyebrow">STUDENT REGISTRATION</p><h2>Create your account</h2><p className="muted">{invite ? <>Joining <b>{invite.classroomName}</b></> : 'A valid classroom invitation is required.'}</p></div>
    {invite ? <form className="auth-form" onSubmit={submit}><label className="auth-field" htmlFor="full-name"><span>Your name</span><div className="input-wrap"><UserRound size={17} /><input id="full-name" value={form.name} onChange={update('name')} required minLength={2} maxLength={60} placeholder="Your name" autoComplete="name" /></div></label><label className="auth-field" htmlFor="register-email"><span>Email address</span><div className="input-wrap"><Mail size={17} /><input id="register-email" type="email" value={form.email} onChange={update('email')} required autoComplete="email" placeholder="you@example.com" /></div></label><PasswordField id="new-password" label="Create password" value={form.password} onChange={update('password')} /><label className="auth-field" htmlFor="confirm-password"><span>Confirm password</span><div className="input-wrap"><KeyRound size={17} /><input id="confirm-password" type="password" value={form.confirm} onChange={update('confirm')} required minLength={8} autoComplete="new-password" placeholder="Enter it again" /></div></label>{error && <div className="alert-error" role="alert">{error}</div>}<Button className="full-width" disabled={loading}>{loading ? 'Creating account…' : <>Join {invite.classroomName} <ArrowRight size={17} /></>}</Button><p className="fine-print">This is a local mock registration. The invitation flow is not validated by a server yet.</p></form> : <div className="invite-missing"><div className="invite-symbol"><ShieldCheck size={24} /></div><p>Open this page from a classroom QR invitation provided by your teacher.</p><LinkButton to="/login" variant="secondary">Back to log in</LinkButton></div>}
    <p className="auth-foot">Already have an account? <Link to="/login">Log in</Link></p></Card></div>;
}

function LinkButton({ to, children, variant }) { return <Link className={`btn btn-${variant}`} to={to}>{children}</Link>; }

export function TeacherInvitePage() {
  const [params] = useSearchParams();
  const { data, setData } = useData();
  const token = params.get('token');
  const invite = data.invites.find((item) => item.type === 'teacher' && item.token === token && item.status === 'Pending' && item.expiresAt > Date.now());
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: invite?.email || '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault(); setError('');
    if (!invite) { setError('This teacher invitation is invalid or expired. Contact the administrator who invited you.'); return; }
    if (form.email.toLowerCase() !== invite.email.toLowerCase()) { setError('Use the email address this invitation was sent to.'); return; }
    if (form.password !== form.confirm) { setError('Your passwords do not match.'); return; }
    try { const user = await register({ ...form, role: 'teacher', invite }); setData((current) => ({ ...current, invites: current.invites.map((item) => item.token === invite.token ? { ...item, status: 'Accepted' } : item) })); navigate(`/${user.role}`); }
    catch (cause) { setError(cause.message); }
  };
  return <div className="auth-grid"><AuthIntro eyebrow="TEACHER INVITATION" title={<>Make room<br /><em>for ideas.</em></>}><p>Your classroom starts with a space to learn, write, and connect.</p></AuthIntro><Card className="auth-card"><div className="auth-card-heading"><span className="auth-icon"><ShieldCheck size={22} /></span><p className="eyebrow">INVITED TEACHER</p><h2>Accept your invitation</h2><p className="muted">Teacher accounts are created by an administrator.</p></div>{invite ? <form className="auth-form" onSubmit={submit}><label className="auth-field" htmlFor="teacher-name"><span>Your name</span><div className="input-wrap"><UserRound size={17} /><input id="teacher-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required minLength={2} autoComplete="name" placeholder="Your name" /></div></label><label className="auth-field" htmlFor="teacher-email"><span>Invited email</span><div className="input-wrap"><Mail size={17} /><input id="teacher-email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required autoComplete="email" /></div></label><PasswordField id="teacher-password" label="Create password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /><label className="auth-field" htmlFor="teacher-confirm"><span>Confirm password</span><div className="input-wrap"><KeyRound size={17} /><input id="teacher-confirm" type="password" value={form.confirm} onChange={(event) => setForm({ ...form, confirm: event.target.value })} required minLength={8} autoComplete="new-password" placeholder="Enter it again" /></div></label>{error && <div className="alert-error" role="alert">{error}</div>}<Button className="full-width">Accept invitation <ArrowRight size={17} /></Button><p className="fine-print">Mock invitation only. A backend must validate and consume the real invitation token.</p></form> : <div className="invite-missing"><div className="invite-symbol"><ShieldCheck size={24} /></div><p>This link may have expired or already been used. Ask your administrator for a new invitation.</p><LinkButton to="/login" variant="secondary">Back to log in</LinkButton></div>}<p className="auth-foot">Already have an account? <Link to="/login">Log in</Link></p></Card></div>;
}
