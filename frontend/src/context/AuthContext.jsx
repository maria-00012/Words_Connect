import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { DEMO_PASSWORD, seedUsers } from '../app/mockSeed.js';
import { createId, pause } from '../services/mockApi.js';

const AuthContext = createContext(null);
const AUTH_KEY = 'wc_frontend_mock_user';
const usersKey = 'wc_frontend_mock_users';
const credentialsKey = 'wc_frontend_mock_credentials';

function readUsers() {
  try { return JSON.parse(localStorage.getItem(usersKey)) || seedUsers; } catch { return seedUsers; }
}
function readCredentials() {
  try { return JSON.parse(localStorage.getItem(credentialsKey)) || {}; } catch { return {}; }
}
async function passwordDigest(password) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export function AuthProvider({ children }) {
  const [users, setUsers] = useState(readUsers);
  const [credentials, setCredentials] = useState(readCredentials);
  const [user, setUser] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(AUTH_KEY));
      return saved ? readUsers().find((candidate) => candidate.id === saved.id) || null : null;
    } catch { return null; }
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => localStorage.setItem(usersKey, JSON.stringify(users)), [users]);
  useEffect(() => localStorage.setItem(credentialsKey, JSON.stringify(credentials)), [credentials]);
  useEffect(() => { window.dispatchEvent(new CustomEvent('wc:users-updated', { detail: users })); }, [users]);
  useEffect(() => {
    if (user) localStorage.setItem(AUTH_KEY, JSON.stringify({ id: user.id }));
  }, [user]);

  const login = async (email, password) => {
    setLoading(true);
    await pause();
    const match = users.find((candidate) => candidate.email.toLowerCase() === email.trim().toLowerCase());
    let suppliedDigest = null;
    try { suppliedDigest = match && credentials[match.id] ? await passwordDigest(password) : null; }
    catch { setLoading(false); throw new Error('Secure browser storage is unavailable for this demo.'); }
    setLoading(false);
    if (!match || (credentials[match.id] ? suppliedDigest !== credentials[match.id] : password !== DEMO_PASSWORD) || match.status === 'Suspended') throw new Error('That email and password combination was not recognized.');
    localStorage.setItem(AUTH_KEY, JSON.stringify({ id: match.id }));
    setUser(match);
    return match;
  };

  const register = async ({ name, email, password, role, invite }) => {
    setLoading(true);
    await pause();
    if (password.length < 8) { setLoading(false); throw new Error('Use at least 8 characters for your password.'); }
    if (users.some((candidate) => candidate.email.toLowerCase() === email.trim().toLowerCase())) { setLoading(false); throw new Error('An account already exists for this email.'); }
    let passwordHash;
    try { passwordHash = await passwordDigest(password); }
    catch { setLoading(false); throw new Error('Secure browser storage is unavailable for this demo.'); }
    const created = { id: createId('u'), name: name.trim(), email: email.trim().toLowerCase(), role, status: 'Active', classroomId: role === 'student' ? invite?.classroomId : undefined };
    const next = [...users, created];
    setUsers(next);
    setCredentials((current) => ({ ...current, [created.id]: passwordHash }));
    localStorage.setItem(AUTH_KEY, JSON.stringify({ id: created.id }));
    setUser(created);
    setLoading(false);
    return created;
  };

  const updateProfile = (changes) => {
    const normalizedEmail = changes.email?.trim().toLowerCase() || user.email;
    if (users.some((candidate) => candidate.id !== user.id && candidate.email.toLowerCase() === normalizedEmail)) return { error: 'That email address is already in use.' };
    const updated = { ...user, name: changes.name?.trim() || user.name, email: normalizedEmail };
    setUsers((current) => current.map((candidate) => candidate.id === user.id ? updated : candidate));
    setUser(updated);
    return { user: updated };
  };

  const logout = () => { localStorage.removeItem(AUTH_KEY); setUser(null); };
  const value = useMemo(() => ({ user, users, setUsers, login, register, updateProfile, logout, loading }), [user, users, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
};
