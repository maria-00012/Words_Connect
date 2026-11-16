import { requireSupabase } from '../../lib/supabase.js';
import { sha256Hex } from '../../lib/hash.js';

const profileColumns = 'id, display_name, email, role, status, created_at';
const invitationColumns = 'id, intended_role, email, status, expires_at, consumed_by, consumed_at, revoked_at, created_at';

function throwIfError(error) {
  if (error) throw new Error(error.message || 'The request could not be completed.');
}

export async function loadPeopleAndInvitations() {
  const client = requireSupabase();
  const [profilesResult, invitationsResult] = await Promise.all([
    client.from('profiles').select(profileColumns).order('created_at', { ascending: false }),
    client.from('invitations').select(invitationColumns)
      .eq('intended_role', 'teacher').order('created_at', { ascending: false }),
  ]);
  throwIfError(profilesResult.error);
  throwIfError(invitationsResult.error);
  return { users: profilesResult.data || [], invitations: invitationsResult.data || [] };
}

function createToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function createTeacherInvitation(email) {
  const normalizedEmail = email.trim().toLowerCase();
  const token = createToken();
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: id, error } = await requireSupabase().rpc('create_invitation', {
    p_token_hash: tokenHash,
    p_intended_role: 'teacher',
    p_email: normalizedEmail,
    p_classroom_id: null,
    p_expires_at: expiresAt,
  });
  throwIfError(error);
  if (!id) throw new Error('The database did not confirm that the invitation was created.');
  return { id, token, email: normalizedEmail, expiresAt };
}

export async function revokeTeacherInvitation(invitationId) {
  const { error } = await requireSupabase().rpc('revoke_invitation', { p_invitation_id: invitationId });
  throwIfError(error);
}

export async function setPlatformUserStatus(profileId, status) {
  const { error } = await requireSupabase().rpc('set_profile_status', {
    p_profile_id: profileId,
    p_status: status,
  });
  throwIfError(error);
}
