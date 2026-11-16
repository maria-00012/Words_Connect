import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { Button, Card } from '../../components/ui.jsx';

export function BootstrapAdminPage() {
  const { bootstrapFirstAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      const user = await bootstrapFirstAdmin(email, password);
      navigate(`/${user.role}`, { replace: true });
    } catch (cause) { setError(cause.message); }
  };

  return <div className="auth-grid">
    <div className="auth-intro"><p className="eyebrow">PROJECT OWNER SETUP</p><h1>Secure your<br /><em>first admin.</em></h1><p>Use the existing Supabase Auth account whose UUID was authorized in the project’s private bootstrap record.</p></div>
    <Card className="auth-card">
      <div className="auth-card-heading"><span className="auth-icon"><ShieldCheck size={22} /></span><p className="eyebrow">ONE-TIME BOOTSTRAP</p><h2>Provision first administrator</h2><p className="muted">The database verifies your signed-in Auth identity and email confirmation. This form has no role selector.</p></div>
      <form className="auth-form" onSubmit={submit}>
        <label className="auth-field" htmlFor="bootstrap-email"><span>Account email</span><div className="input-wrap"><Mail size={17} /><input id="bootstrap-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required /></div></label>
        <label className="auth-field" htmlFor="bootstrap-password"><span>Password</span><div className="input-wrap"><KeyRound size={17} /><input id="bootstrap-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></div></label>
        {error && <div className="alert-error" role="alert">{error}</div>}
        <Button className="full-width" disabled={loading}>{loading ? 'Verifying account…' : <>Provision administrator <ArrowRight size={17} /></>}</Button>
      </form>
      <p className="fine-print">Only the Auth UUID pre-authorized by the project owner can claim this operation. A successful claim is permanent; retries by that same account are safe.</p>
      <Link className="text-link" to="/login">Return to login</Link>
    </Card>
  </div>;
}
