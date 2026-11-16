import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, BookOpenCheck, Eye, EyeOff, GraduationCap, KeyRound, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { Button, Card } from '../../components/ui.jsx';

function AuthIntro({ eyebrow = 'A CLASSROOM FOR IDEAS', title, children }) {
  return <div className="auth-intro"><span className="intro-orbit orbit-one" /><span className="intro-orbit orbit-two" /><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{children}<div className="auth-promise"><span>01</span> Understand the idea <i /> <span>02</span> Make it yours</div></div>;
}

function PasswordField({ value, onChange, id = 'password', label = 'Password' }) {
  const [visible, setVisible] = useState(false);
  return <label className="auth-field" htmlFor={id}><span>{label}</span><div className="input-wrap"><KeyRound size={17} /><input id={id} type={visible ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={label === 'Password' ? 'current-password' : 'new-password'} required minLength={8} placeholder="At least 8 characters" /><button type="button" className="password-toggle" aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>;
}

export function LoginPage() {
  const { login, loading, authError } = useAuth();
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
        {(error || authError) && <div className="alert-error" role="alert">{error || authError}</div>}<Button className="full-width" disabled={loading}>{loading ? 'Opening your class…' : <>Log in <ArrowRight size={17} /></>}</Button>
      </form>
      <div className="auth-divider"><span>NEW TO WORDS CONNECT?</span></div><p className="auth-foot">Students can register with a classroom invitation. Teachers need an invitation from an administrator.</p><Link className="text-link" to="/register">I have a classroom invitation <ArrowRight size={15} /></Link>
      <p className="fine-print">Sign in with your Supabase account. Demo classroom data remains local and does not provide login credentials.</p>
    </Card></div>;
}

function useInviteRegistration(token) {
  const { register, loading, authError } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault(); setError('');
    if (form.password !== form.confirm) { setError('Your passwords do not match.'); return; }
    try {
      const result = await register({ ...form, invitationToken: token });
      if (result.sessionRequired) {
        setError('Supabase did not return a sign-in session. The administrator must turn off Confirm Email before invitation registration can finish.');
        return;
      }
      navigate('/account-ready', { replace: true, state: { invitationAccepted: true, role: result.role } });
    } catch (cause) { setError(cause.message); }
  };
  return { form, update, submit, error, loading, authError };
}

export function AccountReadyPage() {
  const { logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const accepted = location.state?.invitationAccepted === true;
  const role = location.state?.role;
  const accountType = role === 'teacher' ? 'teacher' : 'student';

  const goToLogin = async () => {
    setBusy(true);
    setError('');
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch (cause) {
      setError(cause.message || 'Unable to sign out right now. Please try again.');
    } finally { setBusy(false); }
  };

  return <div className="auth-grid"><AuthIntro eyebrow="INVITATION ACCEPTED" title={<>A new chapter<br /><em>starts here.</em></>}><p>Your invitation has been checked by Words Connect.</p></AuthIntro><Card className="auth-card"><div className="auth-card-heading"><span className="auth-icon"><ShieldCheck size={22} /></span><p className="eyebrow">WORDS CONNECT</p><h2>{accepted ? 'Your account is ready!' : 'Account setup incomplete'}</h2><p className="muted">{accepted ? `Your ${accountType} invitation has been accepted and your ${accountType} account is ready to use.` : 'This page appears after a valid classroom or teacher invitation has been accepted.'}</p></div>{accepted ? <><p className="auth-foot">You can now log in to Words Connect.</p>{error && <div className="alert-error" role="alert">{error}</div>}<Button className="full-width" disabled={busy} onClick={goToLogin}>{busy ? 'Signing out…' : 'Go to Login'} <ArrowRight size={17} /></Button></> : <div className="invite-missing"><div className="alert-error" role="alert">No completed invitation was found for this page.</div><LinkButton to="/login" variant="secondary">Go to Login</LinkButton></div>}</Card></div>;
}

function InvitationForm({ kind, token }) {
  const { form, update, submit, error, loading, authError } = useInviteRegistration(token);
  const student = kind === 'student';
  return <form className="auth-form" onSubmit={submit}>
    <label className="auth-field" htmlFor={`${kind}-name`}><span>Your name</span><div className="input-wrap"><UserRound size={17} /><input id={`${kind}-name`} value={form.name} onChange={update('name')} required minLength={2} maxLength={60} placeholder="Your name" autoComplete="name" /></div></label>
    <label className="auth-field" htmlFor={`${kind}-email`}><span>{student ? 'Email address' : 'Invited email'}</span><div className="input-wrap"><Mail size={17} /><input id={`${kind}-email`} type="email" value={form.email} onChange={update('email')} required autoComplete="email" placeholder="you@example.com" /></div></label>
    <PasswordField id={`${kind}-password`} label="Create password" value={form.password} onChange={update('password')} />
    <label className="auth-field" htmlFor={`${kind}-confirm`}><span>Confirm password</span><div className="input-wrap"><KeyRound size={17} /><input id={`${kind}-confirm`} type="password" value={form.confirm} onChange={update('confirm')} required minLength={8} autoComplete="new-password" placeholder="Enter it again" /></div></label>
    {(error || authError) && <div className="alert-error" role="alert">{error || authError}</div>}
    <Button className="full-width" disabled={loading}>{loading ? 'Creating account…' : <>{student ? 'Create account' : 'Accept invitation'} <ArrowRight size={17} /></>}</Button>
    <p className="fine-print">The database validates and consumes this invitation after authentication. It determines the account role; this form cannot choose one.</p>
    <span className="sr-only">Invitation token present: {Boolean(token).toString()}</span>
  </form>;
}

export function RegisterPage() {
  const [params] = useSearchParams();
  const token = params.get('invite') || params.get('token');
  return <div className="auth-grid"><AuthIntro eyebrow="JOIN A CLASSROOM" title={<>Your next idea<br /><em>starts here.</em></>}><p>Scan your teacher’s classroom QR code to join the learning community.</p></AuthIntro><Card className="auth-card"><div className="auth-card-heading"><span className="auth-icon"><GraduationCap size={22} /></span><p className="eyebrow">STUDENT REGISTRATION</p><h2>Create your account</h2><p className="muted">{token ? 'Invitation link received. Classroom details are shown after the database accepts it.' : 'A database invitation link is required.'}</p></div>
    {token ? <InvitationForm kind="student" token={token} /> : <div className="invite-missing"><div className="invite-symbol"><ShieldCheck size={24} /></div><p>Open this page from a valid classroom invitation provided by your teacher.</p><LinkButton to="/login" variant="secondary">Back to log in</LinkButton></div>}
    <p className="auth-foot">Already have an account? <Link to={token ? `/login?invite=${encodeURIComponent(token)}` : '/login'}>Log in</Link></p></Card></div>;
}

function LinkButton({ to, children, variant }) { return <Link className={`btn btn-${variant}`} to={to}>{children}</Link>; }

export function TeacherInvitePage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  return <div className="auth-grid"><AuthIntro eyebrow="TEACHER INVITATION" title={<>Make room<br /><em>for ideas.</em></>}><p>Your classroom starts with a space to learn, write, and connect.</p></AuthIntro><Card className="auth-card"><div className="auth-card-heading"><span className="auth-icon"><ShieldCheck size={22} /></span><p className="eyebrow">INVITED TEACHER</p><h2>Accept your invitation</h2><p className="muted">Teacher accounts are created by an administrator.</p></div>{token ? <InvitationForm kind="teacher" token={token} /> : <div className="invite-missing"><div className="invite-symbol"><ShieldCheck size={24} /></div><p>Open this page from a valid teacher invitation provided by an administrator.</p><LinkButton to="/login" variant="secondary">Back to log in</LinkButton></div>}<p className="auth-foot">Already have an account? <Link to="/login">Log in</Link></p></Card></div>;
}
