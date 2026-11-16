import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { seedUsers } from '../app/mockSeed.js';
import { isSupabaseConfigured, requireSupabase, supabase } from '../lib/supabase.js';
import { sha256Hex } from '../lib/hash.js';

const AuthContext = createContext(null);
const usersKey = 'wc_frontend_mock_users';

function readUsers() {
  try { return JSON.parse(localStorage.getItem(usersKey)) || seedUsers; } catch { return seedUsers; }
}

function toAppUser(profile) {
  return {
    id: profile.id,
    name: profile.display_name || profile.email,
    email: profile.email,
    role: profile.role,
    status: profile.status === 'active' ? 'Active' : profile.status,
  };
}

const validRoles = new Set(['student', 'teacher', 'admin']);

class AccountRejectedError extends Error {}
class InvitationRejectedError extends Error {}
class ProfileLookupError extends Error {
  constructor(message, retryable = false) {
    super(message);
    this.retryable = retryable;
  }
}
class StaleSessionError extends Error {}

function sessionKey(session) {
  if (!session?.user?.id || !session.access_token) return '';
  return `${session.user.id}:${session.access_token}`;
}

function invitationTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('invite') || params.get('token');
}

export function AuthProvider({ children }) {
  // This list remains the dashboard's local mock directory; it is not an Auth source.
  const [users, setUsers] = useState(readUsers);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(!isSupabaseConfigured);
  const [authError, setAuthError] = useState('');
  const activationPromisesRef = useRef(new Map());
  const explicitSessionKeysRef = useRef(new Set());
  const authOperationCountRef = useRef(0);
  const authEventVersionRef = useRef(0);
  const currentSessionKeyRef = useRef('');
  const bootstrapAttemptRef = useRef(false);

  const rememberExplicitSession = (session) => {
    const key = sessionKey(session);
    if (!key) return;
    explicitSessionKeysRef.current.add(key);
    if (explicitSessionKeysRef.current.size > 12) {
      explicitSessionKeysRef.current.delete(explicitSessionKeysRef.current.values().next().value);
    }
  };

  const activateSession = useCallback(async (session, { consumeInvite = true, invitationToken, commitUser = true } = {}) => {
    if (!session?.user) { setUser(null); return null; }
    const token = consumeInvite ? invitationToken || invitationTokenFromUrl() : null;
    const key = sessionKey(session);
    if (!key) throw new AccountRejectedError('Supabase did not provide a valid authenticated session.');
    const { data: currentData, error: currentError } = await requireSupabase().auth.getSession();
    if (currentError || sessionKey(currentData.session) !== key) throw new StaleSessionError('This sign-in was replaced by a newer session.');
    if (currentSessionKeyRef.current !== key) {
      currentSessionKeyRef.current = key;
      setUser((current) => current?.id === session.user.id ? current : null);
      setAuthError('');
    }

    let activation = activationPromisesRef.current.get(key);
    if (!activation) {
      activation = (async () => {
        const loadProfile = async () => {
          for (let attempt = 0; attempt < 3; attempt += 1) {
            const { data, error, status } = await requireSupabase()
              .from('profiles')
              .select('id, display_name, email, role, status')
              .eq('id', session.user.id)
              .maybeSingle();
            if (!error) {
              if (!data) throw new AccountRejectedError('No Words Connect profile exists for this account.');
              return data;
            }
            const retryable = status === 0 || status === 429 || status >= 500
              || error.code?.startsWith('08') || ['PGRST000', 'PGRST003'].includes(error.code);
            const failure = new ProfileLookupError(error.message || 'Your account profile could not be loaded.', retryable);
            if (!retryable || attempt === 2) throw failure;
            await new Promise((resolve) => window.setTimeout(resolve, 200 * (attempt + 1)));
            const { data: latest, error: sessionError } = await requireSupabase().auth.getSession();
            if (sessionError || sessionKey(latest.session) !== key) throw new StaleSessionError('This sign-in was replaced by a newer session.');
          }
          throw new ProfileLookupError('Your account profile could not be loaded.', true);
        };

        let profile = await loadProfile();
        // Pending accounts consume their role invitation. Active students may
        // also consume a classroom QR invitation when they already have an
        // account, allowing the invite flow to add another classroom.
        const canConsumeInvite = profile.status === 'pending'
          || (profile.status === 'active' && profile.role === 'student');
        if (token && canConsumeInvite) {
          let tokenHash;
          try { tokenHash = sha256Hex(token); }
          catch { throw new InvitationRejectedError('The invitation could not be securely checked. Reload the page and try again.'); }
          const client = requireSupabase();
          const { error } = await client.rpc('consume_invitation', { p_token_hash: tokenHash });
          if (error) throw new InvitationRejectedError(error.message || 'The invitation could not be accepted. Ask the inviter for a new link.');
          profile = await loadProfile();
          if (profile.role === 'student' && profile.status === 'active') {
            const { data: memberships, error: membershipError } = await client.from('classroom_memberships')
              .select('classroom_id, joined_at').eq('student_id', session.user.id).eq('status', 'active')
              .order('joined_at', { ascending: false }).limit(1);
            if (!membershipError && memberships?.[0]) {
              try { localStorage.setItem('wc_student_active_classroom_id', memberships[0].classroom_id); } catch { /* Optional classroom preference. */ }
            }
          }
        }
        if (profile.status !== 'active') {
          throw new AccountRejectedError(profile.status === 'suspended'
            ? 'This account is suspended. Contact an administrator.'
            : 'This account is awaiting a valid invitation. Open the invitation link and try again.');
        }
        if (!validRoles.has(profile.role)) throw new AccountRejectedError('This account has an invalid Words Connect role. Contact an administrator.');
        return toAppUser(profile);
      })();
      activationPromisesRef.current.set(key, activation);
      // Bound the cache while retaining recently completed/in-flight sessions.
      if (activationPromisesRef.current.size > 8) {
        const oldestKey = activationPromisesRef.current.keys().next().value;
        if (oldestKey !== key) activationPromisesRef.current.delete(oldestKey);
      }
    }

    try {
      const appUser = await activation;
      const { data, error } = await requireSupabase().auth.getSession();
      if (error || sessionKey(data.session) !== key) throw new StaleSessionError('This sign-in was replaced by a newer session.');
      currentSessionKeyRef.current = key;
      if (commitUser) setUser(appUser);
      setAuthError('');
      return appUser;
    } catch (error) {
      if (!(error instanceof StaleSessionError) && activationPromisesRef.current.get(key) === activation) {
        activationPromisesRef.current.delete(key);
      }
      const { data } = await requireSupabase().auth.getSession();
      if (sessionKey(data.session) === key) {
        currentSessionKeyRef.current = key;
        setAuthError(error.message || 'Unable to verify this account. Please try again.');
        if (error instanceof AccountRejectedError || error instanceof InvitationRejectedError) setUser(null);
        // Profile/network failures never sign out. Protected routes remain
        // closed because only a validated active profile can populate `user`.
      }
      throw error;
    }
  }, []);

  useEffect(() => {
    if (!supabase) return undefined;
    let mounted = true;
    const { data: authSubscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;
      const eventVersion = ++authEventVersionRef.current;
      const eventKey = sessionKey(session);
      if (event === 'SIGNED_IN' && (authOperationCountRef.current > 0 || explicitSessionKeysRef.current.has(eventKey))) return;
      // Avoid doing PostgREST calls inside Supabase Auth's own callback lock.
      queueMicrotask(async () => {
        if (!mounted) return;
        if (bootstrapAttemptRef.current && window.location.pathname === '/bootstrap-admin') {
          setUser(null);
          setReady(true);
          return;
        }
        if (!session) {
          const { data, error } = await supabase.auth.getSession();
          if (!error && !data.session && eventVersion === authEventVersionRef.current) {
            currentSessionKeyRef.current = '';
            activationPromisesRef.current.clear();
            explicitSessionKeysRef.current.clear();
            setUser(null);
            setAuthError('');
            setReady(true);
          }
          return;
        }
        const { data, error } = await supabase.auth.getSession();
        if (error || sessionKey(data.session) !== eventKey) return;
        // login/register/bootstrap activate their own SIGNED_IN result. Other
        // SIGNED_IN events (such as a confirmation callback) are restored here.
        const shouldConsumeInvite = event === 'SIGNED_IN';
        try {
          await activateSession(session, { consumeInvite: shouldConsumeInvite });
        } catch { /* activateSession records current-session errors without signing out */ }
        if (mounted) setReady(true);
      });
    });

    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!mounted) return;
      if (error) setAuthError(error.message);
      try {
        // The dedicated bootstrap screen handles its own session and does not
        // turn a pending profile into an ordinary application user.
        if (window.location.pathname === '/bootstrap-admin') {
          setUser(null);
          return;
        }
        if (data.session) await activateSession(data.session);
      } catch { /* preserve the Auth session on transient profile/RPC failures */ }
      finally {
        if (mounted) setReady(true);
      }
    });

    return () => { mounted = false; authSubscription.subscription.unsubscribe(); };
  }, [activateSession]);

  useEffect(() => {
    if (!supabase) return;
    localStorage.setItem(usersKey, JSON.stringify(users));
    window.dispatchEvent(new CustomEvent('wc:users-updated', { detail: users }));
  }, [users]);

  const login = async (email, password) => {
    setLoading(true);
    setAuthError('');
    authOperationCountRef.current += 1;
    try {
      const client = requireSupabase();
      const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      rememberExplicitSession(data.session);
      const appUser = await activateSession(data.session);
      return appUser;
    } catch (error) {
      throw new Error(error.message || 'Unable to log in. Check your details and try again.');
    } finally { authOperationCountRef.current -= 1; setLoading(false); }
  };

  const register = async ({ name, email, password, invitationToken }) => {
    if (password.length < 8) throw new Error('Use at least 8 characters for your password.');
    setLoading(true);
    setAuthError('');
    authOperationCountRef.current += 1;
    try {
      const client = requireSupabase();
      const { data, error } = await client.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { display_name: name.trim() } },
      });
      if (error) throw error;
      if (!data.session) return { sessionRequired: true };
      rememberExplicitSession(data.session);
      // Validate the new session and consume the invitation, but keep this
      // registration screen mounted until the user chooses to log in.
      const appUser = await activateSession(data.session, { invitationToken, commitUser: false });
      return appUser;
    } catch (error) {
      throw new Error(error.message || 'Unable to create this account.');
    } finally { authOperationCountRef.current -= 1; setLoading(false); }
  };

  const bootstrapFirstAdmin = async (email, password) => {
    setLoading(true);
    setAuthError('');
    bootstrapAttemptRef.current = true;
    authOperationCountRef.current += 1;
    try {
      const client = requireSupabase();
      // Reauthenticate the account entered on this restricted screen so a
      // previously stored session cannot cause a different account to claim.
      const { error: clearError } = await client.auth.signOut({ scope: 'local' });
      if (clearError) throw clearError;
      const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      if (!data.session?.user) throw new Error('Supabase did not create an authenticated session.');
      rememberExplicitSession(data.session);

      const { data: claimedUserId, error: bootstrapError } = await client.rpc('bootstrap_first_admin');
      if (bootstrapError) throw bootstrapError;
      if (claimedUserId !== data.session.user.id) {
        throw new Error('The database returned a different Auth user ID. Bootstrap was not accepted.');
      }
      const appUser = await activateSession(data.session, { consumeInvite: false });
      if (appUser.role !== 'admin' || appUser.status !== 'Active') {
        throw new Error('Bootstrap completed without an active administrator profile.');
      }
      return appUser;
    } catch (error) {
      if (supabase) await supabase.auth.signOut({ scope: 'local' });
      throw new Error(error.message || 'First-admin bootstrap was not completed.');
    } finally {
      bootstrapAttemptRef.current = false;
      authOperationCountRef.current -= 1;
      setLoading(false);
    }
  };

  const updateProfile = async (changes) => {
    if (!user) return { error: 'You need to log in again.' };
    try {
      const client = requireSupabase();
      const name = changes.name?.trim() || user.name;
      const { error: profileError } = await client.from('profiles').update({ display_name: name }).eq('id', user.id);
      if (profileError) return { error: profileError.message };
      if (changes.email && changes.email.trim().toLowerCase() !== user.email.toLowerCase()) {
        const { error } = await client.auth.updateUser({ email: changes.email.trim().toLowerCase() });
        if (error) return { error: error.message };
        const updated = { ...user, name };
        setUser(updated);
        return { user: updated, emailConfirmationRequired: true };
      }
      const updated = { ...user, name };
      setUser(updated);
      return { user: updated };
    } catch (error) { return { error: error.message }; }
  };

  const logout = async () => {
    if (supabase) {
      const { error } = await supabase.auth.signOut({ scope: 'global' });
      if (error) throw error;
    }
    currentSessionKeyRef.current = '';
    activationPromisesRef.current.clear();
    explicitSessionKeysRef.current.clear();
    setUser(null);
    setAuthError('');
  };

  const value = useMemo(() => ({
    user, users, setUsers, login, register, bootstrapFirstAdmin, updateProfile, logout,
    loading, ready, authError,
  }), [user, users, loading, ready, authError]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
};
